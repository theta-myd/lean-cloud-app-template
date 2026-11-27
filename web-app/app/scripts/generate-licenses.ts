import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

interface PackageJson {
	name?: string;
	version?: string;
	license?: string | { type?: string };
	author?: string | { name?: string };
	repository?: string | { url?: string };
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
}

export interface LicenseRecord {
	name: string;
	version: string;
	license: string;
	author: string | null;
	repository: string | null;
	licenseText: string;
}

const APP_ROOT = resolve(import.meta.dir, '..');
const NODE_MODULES = join(APP_ROOT, 'node_modules');

// Frontend packages bundled or linked for browser execution.
const CLIENT_ROOTS = [
	'svelte',
	'@sveltejs/kit',
	'bits-ui',
	'@lucide/svelte',
	'mode-watcher',
	'tailwind-variants',
	'cn',
	'@fontsource-variable/geist',
	'@internationalized/date',
	'better-auth'
];

// Strictly server-side packages excluded when walking frontend notices.
const SERVER_ONLY_PREFIXES = ['@google-cloud/', '@grpc/', 'google-auth-library', 'google-gax'];

const LICENSE_FILE_CANDIDATES = [
	'LICENSE',
	'LICENSE.md',
	'LICENSE.txt',
	'LICENCE',
	'LICENCE.md',
	'LICENCE.txt',
	'COPYING',
	'NOTICE'
];

function normalizeLicense(license: PackageJson['license']): string {
	if (!license) return 'UNKNOWN';
	if (typeof license === 'string') return license.trim() || 'UNKNOWN';
	return license.type?.trim() || 'UNKNOWN';
}

function normalizeAuthor(author: PackageJson['author']): string | null {
	if (!author) return null;
	if (typeof author === 'string') return author.trim() || null;
	return author.name?.trim() || null;
}

function normalizeRepository(repository: PackageJson['repository']): string | null {
	const raw = typeof repository === 'string' ? repository : repository?.url;
	if (!raw) return null;
	let url = raw.trim().replace(/^git\+/, '').replace(/\.git$/, '');
	if (url.startsWith('git://github.com/')) {
		url = `https://github.com/${url.slice('git://github.com/'.length)}`;
	} else if (url.startsWith('ssh://git@github.com/')) {
		url = `https://github.com/${url.slice('ssh://git@github.com/'.length)}`;
	} else if (/^[^/:]+\/[^/:]+$/.test(url)) {
		url = `https://github.com/${url}`;
	}
	return url.startsWith('http://') || url.startsWith('https://') ? url : null;
}

function readLicenseText(pkgDir: string): string {
	try {
		const entries = readdirSync(pkgDir);
		for (const candidate of LICENSE_FILE_CANDIDATES) {
			const match = entries.find((entry) => entry.toUpperCase() === candidate.toUpperCase());
			if (match) {
				const content = readFileSync(join(pkgDir, match), 'utf8').trim();
				if (content) return content;
			}
		}
	} catch {
		// Fall through to fallback text
	}
	return 'No standalone LICENSE file included in package metadata.';
}

function resolvePackageDir(pkgName: string, fromDir: string): string | null {
	let current = fromDir;
	while (true) {
		const candidate = join(current, 'node_modules', ...pkgName.split('/'));
		if (existsSync(join(candidate, 'package.json'))) {
			return candidate;
		}
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	const rootCandidate = join(NODE_MODULES, ...pkgName.split('/'));
	return existsSync(join(rootCandidate, 'package.json')) ? rootCandidate : null;
}

function collectPackages(roots: string[], excludeServerOnly: boolean): LicenseRecord[] {
	const visitedDirs = new Set<string>();
	const collected = new Map<string, LicenseRecord>();
	const queue: Array<{ name: string; fromDir: string }> = roots.map((name) => ({
		name,
		fromDir: APP_ROOT
	}));

	while (queue.length > 0) {
		const next = queue.shift()!;
		if (excludeServerOnly && SERVER_ONLY_PREFIXES.some((prefix) => next.name.startsWith(prefix))) {
			continue;
		}

		const pkgDir = resolvePackageDir(next.name, next.fromDir);
		if (!pkgDir || visitedDirs.has(pkgDir)) continue;
		visitedDirs.add(pkgDir);

		let pkg: PackageJson;
		try {
			pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as PackageJson;
		} catch {
			continue;
		}

		const name = pkg.name || next.name;
		const version = pkg.version || '0.0.0';
		const key = `${name}@${version}`;

		if (!collected.has(key)) {
			collected.set(key, {
				name,
				version,
				license: normalizeLicense(pkg.license),
				author: normalizeAuthor(pkg.author),
				repository: normalizeRepository(pkg.repository),
				licenseText: readLicenseText(pkgDir)
			});
		}

		const childDeps = Object.keys(pkg.dependencies ?? {});
		for (const dep of childDeps) {
			queue.push({ name: dep, fromDir: pkgDir });
		}
	}

	return Array.from(collected.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function formatLicensesTxt(records: LicenseRecord[], generatedAt: string): string {
	const header = [
		'THIRD-PARTY SOFTWARE NOTICES AND INFORMATION',
		`Generated at: ${generatedAt}`,
		`Total packages: ${records.length}`,
		'='.repeat(72),
		''
	].join('\n');

	const body = records
		.map((pkg) => {
			const lines = [
				`Package: ${pkg.name}@${pkg.version}`,
				`License: ${pkg.license}`
			];
			if (pkg.author) lines.push(`Author: ${pkg.author}`);
			if (pkg.repository) lines.push(`Repository: ${pkg.repository}`);
			lines.push('-'.repeat(40), pkg.licenseText, '', '='.repeat(72), '');
			return lines.join('\n');
		})
		.join('\n');

	return `${header}\n${body}`;
}

function main() {
	const rootPkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as PackageJson;
	const generatedAt = new Date().toISOString();

	const clientPackages = collectPackages(CLIENT_ROOTS, true).map((pkg) => ({
		...pkg,
		licenseText:
			pkg.licenseText.length > 16000
				? `${pkg.licenseText.slice(0, 16000)}\n... (truncated; see licenses.txt)`
				: pkg.licenseText
	}));

	const jsonOutPath = join(APP_ROOT, 'src', 'lib', 'generated', 'client-licenses.json');
	mkdirSync(dirname(jsonOutPath), { recursive: true });
	writeFileSync(
		jsonOutPath,
		JSON.stringify({ generatedAt, packages: clientPackages }, null, 2),
		'utf8'
	);

	const txtFlagIndex = process.argv.indexOf('--txt');
	if (txtFlagIndex !== -1 && process.argv[txtFlagIndex + 1]) {
		const txtOutPath = resolve(APP_ROOT, process.argv[txtFlagIndex + 1]);
		const allRoots = Array.from(
			new Set([...CLIENT_ROOTS, ...Object.keys(rootPkg.dependencies ?? {})])
		);
		const allPackages = collectPackages(allRoots, false);
		mkdirSync(dirname(txtOutPath), { recursive: true });
		writeFileSync(txtOutPath, formatLicensesTxt(allPackages, generatedAt), 'utf8');
		console.log(`Generated ${clientPackages.length} client notices and ${allPackages.length} total notices in ${txtOutPath}`);
	} else {
		console.log(`Generated ${clientPackages.length} client license notices in ${jsonOutPath}`);
	}
}

main();
