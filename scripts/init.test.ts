import { describe, expect, it } from 'bun:test';
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
	parseCliArgs,
	runInit,
	validateAppName,
	validateCloud,
	validateVariant
} from './init.ts';

const REPO_ROOT = resolve(import.meta.dir, '..');

function createTempRepoCopy(): string {
	const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), 'lean-cloud-init-test-')));
	const copyEntries = [
		'package.json',
		'compose.yaml',
		'compose',
		'buf.yaml',
		'buf.gen.yaml',
		'proto',
		'.github',
		'scripts',
		'desktop',
		'web-app/infra',
		'web-app/api',
		'web-app/app'
	];

	for (const rel of copyEntries) {
		const src = join(REPO_ROOT, rel);
		if (!existsSync(src)) continue;
		const dest = join(tempRoot, rel);
		cpSync(src, dest, {
			recursive: true,
			filter: (p) =>
				!p.includes('/node_modules') &&
				!p.includes('/.svelte-kit') &&
				!p.includes('/build') &&
				!p.includes('/target')
		});
	}

	return tempRoot;
}

function collectSourceFiles(dir: string): string[] {
	const out: string[] = [];
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			out.push(...collectSourceFiles(full));
		} else if (/\.(ts|js|svelte)$/.test(entry)) {
			out.push(full);
		}
	}
	return out;
}

function runCmd(cmd: string[], cwd: string): { exitCode: number; stdout: string; stderr: string } {
	const proc = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
	return {
		exitCode: proc.exitCode,
		stdout: new TextDecoder().decode(proc.stdout),
		stderr: new TextDecoder().decode(proc.stderr)
	};
}

describe('scripts/init CLI parsing & validation', () => {
	it('parses flags and validates variant, cloud, and app slug', () => {
		const parsed = parseCliArgs([
			'--',
			'--variant=standard',
			'--cloud=gcp',
			'--name=my-saas-app',
			'--dry-run',
			'--yes'
		]);
		expect(parsed).toMatchObject({
			variant: 'standard',
			cloud: 'gcp',
			name: 'my-saas-app',
			dryRun: true,
			yes: true
		});

		expect(validateVariant('LIGHT')).toBe('light');
		expect(validateVariant('standard')).toBe('standard');
		expect(() => validateVariant('other')).toThrow();

		expect(validateCloud(undefined)).toBe('gcp');
		expect(() => validateCloud('aws')).toThrow('#54');
		expect(() => validateCloud('azure')).toThrow('#55');

		expect(validateAppName('my-app-1')).toBe('my-app-1');
		expect(() => validateAppName('ab')).toThrow();
		expect(() => validateAppName('this-app-name-is-too-long')).toThrow();
		expect(() => validateAppName('Bad_Name')).toThrow();
	});
});

describe('scripts/init end-to-end repository transformations', () => {
	it('does not modify files when --dry-run is enabled', () => {
		const tempRoot = createTempRepoCopy();
		try {
			const beforeCompose = readFileSync(join(tempRoot, 'compose.yaml'), 'utf8');
			const actions = runInit({
				variant: 'standard',
				cloud: 'gcp',
				name: 'demo-std',
				keepApi: false,
				dryRun: true,
				yes: true,
				rootDir: tempRoot
			});

			expect(actions.length).toBeGreaterThan(0);
			expect(readFileSync(join(tempRoot, 'compose.yaml'), 'utf8')).toBe(beforeCompose);
			expect(existsSync(join(tempRoot, 'web-app/app/src/lib/server/light'))).toBe(true);
			expect(existsSync(join(tempRoot, 'web-app/infra/gcp/light'))).toBe(true);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it(
		'scaffolds a clean Standard project that installs without Firestore and passes check, unit tests, and build',
		() => {
			const tempRoot = createTempRepoCopy();
			try {
				runInit({
					variant: 'standard',
					cloud: 'gcp',
					name: 'demo-std-app',
					keepApi: false,
					dryRun: false,
					yes: true,
					rootDir: tempRoot
				});

				// Light BFF & Firestore completely removed
				expect(existsSync(join(tempRoot, 'web-app/app/src/lib/server/light'))).toBe(false);
				expect(existsSync(join(tempRoot, 'web-app/app/tests/server/light'))).toBe(false);
				expect(existsSync(join(tempRoot, 'web-app/app/src/lib/server/standard'))).toBe(true);

				for (const file of [
					...collectSourceFiles(join(tempRoot, 'web-app/app/src')),
					...collectSourceFiles(join(tempRoot, 'web-app/app/tests'))
				]) {
					const src = readFileSync(file, 'utf8');
					expect(src).not.toContain('@google-cloud/firestore');
					expect(src).not.toContain('/light/');
				}

				const backendSrc = readFileSync(
					join(tempRoot, 'web-app/app/src/lib/server/backend.ts'),
					'utf8'
				);
				expect(backendSrc).toContain('./standard/index.js');
				expect(backendSrc).not.toContain('./light/');

				const appPkg = JSON.parse(
					readFileSync(join(tempRoot, 'web-app/app/package.json'), 'utf8')
				) as { name: string; dependencies: Record<string, string> };
				expect(appPkg.name).toBe('demo-std-app');
				expect(appPkg.dependencies['@google-cloud/firestore']).toBeUndefined();
				expect(appPkg.dependencies.pg).toBeDefined();

				// Compose switched to PostgreSQL 18 default
				const compose = readFileSync(join(tempRoot, 'compose.yaml'), 'utf8');
				expect(compose).toContain('postgres:18-alpine');
				expect(compose).toContain('postgres-data:/var/lib/postgresql');
				expect(compose).not.toContain('firestore-emulator');
				expect(compose).not.toContain('profiles:');

				// Infra promoted & renamed
				expect(existsSync(join(tempRoot, 'web-app/infra/gcp/cloud_sql.tf'))).toBe(true);
				expect(existsSync(join(tempRoot, 'web-app/infra/gcp/light'))).toBe(false);
				expect(existsSync(join(tempRoot, 'web-app/infra/gcp/standard'))).toBe(false);
				expect(
					readFileSync(join(tempRoot, 'web-app/infra/gcp/terraform.tfvars.example'), 'utf8')
				).toContain('service_name = "demo-std-app"');
				expect(existsSync(join(tempRoot, '.github/workflows/deploy-gcp.yml'))).toBe(false);
				expect(existsSync(join(tempRoot, '.github/workflows/deploy-gcp-standard.yml'))).toBe(true);

				// Desktop & Rust API renamed
				const tauriConf = JSON.parse(
					readFileSync(join(tempRoot, 'desktop/src-tauri/tauri.conf.json'), 'utf8')
				) as {
					productName: string;
					identifier: string;
					plugins: { 'deep-link': { desktop: { schemes: string[] } } };
				};
				expect(tauriConf.productName).toBe('Demo Std App');
				expect(tauriConf.identifier).toBe('com.example.demo-std-app');
				expect(tauriConf.plugins['deep-link'].desktop.schemes).toEqual(['demostdapp']);
				expect(readFileSync(join(tempRoot, 'web-app/api/Cargo.toml'), 'utf8')).toContain(
					'name = "demo-std-app-api"'
				);

				// Real bun install (without @google-cloud/firestore) + check + unit tests + build
				const appDir = join(tempRoot, 'web-app/app');
				const installRes = runCmd(['bun', 'install'], appDir);
				if (installRes.exitCode !== 0) {
					throw new Error(`Standard install failed:\n${installRes.stdout}\n${installRes.stderr}`);
				}
				const checkRes = runCmd(['bun', '--bun', 'run', 'check'], appDir);
				if (checkRes.exitCode !== 0) {
					throw new Error(`Standard check failed:\n${checkRes.stdout}\n${checkRes.stderr}`);
				}
				const testRes = runCmd(['bun', '--bun', 'run', 'test:unit'], appDir);
				if (testRes.exitCode !== 0) {
					throw new Error(`Standard test:unit failed:\n${testRes.stdout}\n${testRes.stderr}`);
				}
				const buildRes = runCmd(['bun', '--bun', 'run', 'build'], appDir);
				if (buildRes.exitCode !== 0) {
					throw new Error(`Standard build failed:\n${buildRes.stdout}\n${buildRes.stderr}`);
				}
			} finally {
				rmSync(tempRoot, { recursive: true, force: true });
			}
		},
		90_000
	);

	it(
		'scaffolds a clean Light project that installs without pg/ConnectRPC and passes check, unit tests, and build',
		() => {
			const tempRoot = createTempRepoCopy();
			try {
				runInit({
					variant: 'light',
					cloud: 'gcp',
					name: 'demo-light',
					keepApi: false,
					dryRun: false,
					yes: true,
					rootDir: tempRoot
				});

				expect(existsSync(join(tempRoot, 'web-app/app/src/lib/server/light'))).toBe(true);
				expect(existsSync(join(tempRoot, 'web-app/app/src/lib/server/standard'))).toBe(false);
				expect(existsSync(join(tempRoot, 'web-app/app/src/lib/gen'))).toBe(false);
				expect(existsSync(join(tempRoot, 'web-app/app/tests/server/standard'))).toBe(false);
				expect(existsSync(join(tempRoot, 'web-app/api'))).toBe(false);
				expect(existsSync(join(tempRoot, 'proto'))).toBe(false);
				expect(existsSync(join(tempRoot, 'compose'))).toBe(false);
				expect(existsSync(join(tempRoot, '.github/workflows/rust-api-ci.yml'))).toBe(false);
				expect(existsSync(join(tempRoot, '.github/workflows/deploy-gcp-standard.yml'))).toBe(false);
				expect(existsSync(join(tempRoot, '.github/workflows/deploy-gcp.yml'))).toBe(true);

				for (const file of [
					...collectSourceFiles(join(tempRoot, 'web-app/app/src')),
					...collectSourceFiles(join(tempRoot, 'web-app/app/tests'))
				]) {
					const src = readFileSync(file, 'utf8');
					expect(src).not.toContain('@connectrpc/');
					expect(src).not.toContain('@bufbuild/');
					expect(src).not.toContain("from 'pg'");
					expect(src).not.toContain("import('pg')");
					expect(src).not.toContain('/standard/');
				}

				// Infra promoted
				expect(existsSync(join(tempRoot, 'web-app/infra/gcp/firestore.tf'))).toBe(true);
				expect(existsSync(join(tempRoot, 'web-app/infra/gcp/light'))).toBe(false);
				expect(existsSync(join(tempRoot, 'web-app/infra/gcp/standard'))).toBe(false);

				const appPkg = JSON.parse(
					readFileSync(join(tempRoot, 'web-app/app/package.json'), 'utf8')
				) as {
					name: string;
					dependencies: Record<string, string>;
					devDependencies: Record<string, string>;
				};
				expect(appPkg.name).toBe('demo-light');
				expect(appPkg.dependencies['@google-cloud/firestore']).toBeDefined();
				expect(appPkg.dependencies.pg).toBeUndefined();
				expect(appPkg.dependencies['@connectrpc/connect']).toBeUndefined();
				expect(appPkg.devDependencies['@types/pg']).toBeUndefined();

				// Real bun install (without pg / @connectrpc/* / @bufbuild/*) + check + unit tests + build
				const appDir = join(tempRoot, 'web-app/app');
				const installRes = runCmd(['bun', 'install'], appDir);
				if (installRes.exitCode !== 0) {
					throw new Error(`Light install failed:\n${installRes.stdout}\n${installRes.stderr}`);
				}
				const checkRes = runCmd(['bun', '--bun', 'run', 'check'], appDir);
				if (checkRes.exitCode !== 0) {
					throw new Error(`Light check failed:\n${checkRes.stdout}\n${checkRes.stderr}`);
				}
				const testRes = runCmd(['bun', '--bun', 'run', 'test:unit'], appDir);
				if (testRes.exitCode !== 0) {
					throw new Error(`Light test:unit failed:\n${testRes.stdout}\n${testRes.stderr}`);
				}
				const buildRes = runCmd(['bun', '--bun', 'run', 'build'], appDir);
				if (buildRes.exitCode !== 0) {
					throw new Error(`Light build failed:\n${buildRes.stdout}\n${buildRes.stderr}`);
				}
			} finally {
				rmSync(tempRoot, { recursive: true, force: true });
			}
		},
		90_000
	);

	it('preserves web-app/api/ and proto/ when --variant=light --keep-api is set', () => {
		const tempRoot = createTempRepoCopy();
		try {
			runInit({
				variant: 'light',
				cloud: 'gcp',
				keepApi: true,
				dryRun: false,
				yes: true,
				rootDir: tempRoot
			});

			// BFF is still Light-only
			expect(existsSync(join(tempRoot, 'web-app/app/src/lib/server/light'))).toBe(true);
			expect(existsSync(join(tempRoot, 'web-app/app/src/lib/server/standard'))).toBe(false);
			// Rust API & proto kept as reference
			expect(existsSync(join(tempRoot, 'web-app/api/Cargo.toml'))).toBe(true);
			expect(existsSync(join(tempRoot, 'proto/todo/v1/todo.proto'))).toBe(true);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});
});
