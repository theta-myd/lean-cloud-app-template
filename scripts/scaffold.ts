#!/usr/bin/env bun
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import {
	runInit,
	validateAppName,
	validateCloud,
	validateVariant,
	type ArchitectureVariant,
	type CloudProvider
} from './init.ts';

export type ScaffoldTarget = 'web-app' | 'desktop' | 'both';

export interface ScaffoldOptions {
	target: ScaffoldTarget;
	variant: ArchitectureVariant;
	cloud: CloudProvider;
	name?: string;
	keepApi: boolean;
	withCi: boolean;
	withDocs: boolean;
	force: boolean;
	dryRun: boolean;
	yes: boolean;
	destDir: string;
	templateRoot: string;
}

export interface ParsedScaffoldArgs {
	target?: string;
	variant?: string;
	cloud?: string;
	name?: string;
	dir?: string;
	keepApi: boolean;
	withCi: boolean;
	withDocs: boolean;
	force: boolean;
	dryRun: boolean;
	yes: boolean;
	help: boolean;
}

export interface PlannedCopyAction {
	kind: 'create' | 'overwrite' | 'skip';
	relPath: string;
	srcPath: string;
	destPath: string;
}

export interface ScaffoldResult {
	actions: PlannedCopyAction[];
	created: number;
	overwritten: number;
	skipped: number;
}

const VALID_TARGETS: readonly ScaffoldTarget[] = ['web-app', 'desktop', 'both'];

const EXCLUDED_SEGMENTS = new Set([
	'.git',
	'.worktrees',
	'node_modules',
	'.svelte-kit',
	'build',
	'dist',
	'.output',
	'target',
	'.terraform',
	'.DS_Store'
]);

const HELP_TEXT = `Usage: bunx github:theta-mynd/agent-ready-app-template [options]

Scaffold selected components (web-app, desktop, or both) from agent-ready-app-template
into an existing or empty repository without overwriting existing files by default.

Options:
  --target <web-app|desktop|both>  Components to scaffold (prompted interactively if omitted)
  --variant <light|standard>       Web app architecture variant (required for web-app/both; prompted if omitted)
  --cloud <gcp>                    Target cloud provider (default: gcp; AWS: #54, Azure: #55)
  --name <slug>                    Optional app slug (3-18 lowercase alphanumeric/hyphen chars, e.g. my-app)
  --dir <path>                     Destination directory (default: current working directory)
  --keep-api                       With --variant=light, keep web-app/api/ and proto/ as reference examples
  --with-ci                        Also copy matching .github/workflows/* and .gitleaks.toml
  --with-docs                      Also copy AGENTS.md, GEMINI.md, and docs/
  --force                          Overwrite existing files instead of skipping conflicts
  --dry-run                        Preview planned file additions and conflicts without modifying anything
  -y, --yes                        Skip interactive confirmation prompt
  -h, --help                       Show this help message

Examples:
  bunx github:theta-mynd/agent-ready-app-template
  bunx github:theta-mynd/agent-ready-app-template --target=web-app --variant=light --name=my-app --dry-run
  bunx github:theta-mynd/agent-ready-app-template --target=web-app --variant=light --name=my-app --yes
  bunx github:theta-mynd/agent-ready-app-template --target=desktop --name=my-app --yes
  bunx github:theta-mynd/agent-ready-app-template --target=both --variant=standard --name=my-saas --with-ci --yes
`;

export function parseScaffoldArgs(argv: string[]): ParsedScaffoldArgs {
	const parsed: ParsedScaffoldArgs = {
		keepApi: false,
		withCi: false,
		withDocs: false,
		force: false,
		dryRun: false,
		yes: false,
		help: false
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--') continue;
		if (arg === '-h' || arg === '--help') {
			parsed.help = true;
		} else if (arg === '--dry-run') {
			parsed.dryRun = true;
		} else if (arg === '-y' || arg === '--yes') {
			parsed.yes = true;
		} else if (arg === '--keep-api') {
			parsed.keepApi = true;
		} else if (arg === '--with-ci') {
			parsed.withCi = true;
		} else if (arg === '--with-docs') {
			parsed.withDocs = true;
		} else if (arg === '--force') {
			parsed.force = true;
		} else if (arg.startsWith('--target=')) {
			parsed.target = arg.slice('--target='.length);
		} else if (arg === '--target') {
			parsed.target = argv[++i];
		} else if (arg.startsWith('--variant=')) {
			parsed.variant = arg.slice('--variant='.length);
		} else if (arg === '--variant') {
			parsed.variant = argv[++i];
		} else if (arg.startsWith('--cloud=')) {
			parsed.cloud = arg.slice('--cloud='.length);
		} else if (arg === '--cloud') {
			parsed.cloud = argv[++i];
		} else if (arg.startsWith('--name=')) {
			parsed.name = arg.slice('--name='.length);
		} else if (arg === '--name') {
			parsed.name = argv[++i];
		} else if (arg.startsWith('--dir=')) {
			parsed.dir = arg.slice('--dir='.length);
		} else if (arg === '--dir') {
			parsed.dir = argv[++i];
		} else {
			throw new Error(`Unknown option: ${arg}. Run with --help for usage.`);
		}
	}

	return parsed;
}

export function validateTarget(target: string | undefined): ScaffoldTarget {
	const normalized = target?.trim().toLowerCase();
	if (normalized && (VALID_TARGETS as readonly string[]).includes(normalized)) {
		return normalized as ScaffoldTarget;
	}
	throw new Error(
		`Invalid or missing --target "${target ?? ''}". Expected "web-app", "desktop", or "both".`
	);
}

function shouldIncludeTemplatePath(templateRoot: string, fullPath: string): boolean {
	const rel = relative(templateRoot, fullPath);
	if (!rel) return true;
	const parts = rel.split(/[\\/]/);

	for (const part of parts) {
		if (EXCLUDED_SEGMENTS.has(part)) return false;
	}

	const fileName = parts[parts.length - 1];
	if (fileName === '.terraform.lock.hcl') return false;
	if (fileName === '.env' || (fileName.startsWith('.env.') && fileName !== '.env.example')) {
		return false;
	}
	if (fileName.endsWith('.tfstate') || fileName.includes('.tfstate.')) return false;
	if (
		(fileName.endsWith('.tfvars') || fileName.endsWith('.tfvars.json')) &&
		!fileName.endsWith('.tfvars.example')
	) {
		return false;
	}
	if (rel.replace(/\\/g, '/').startsWith('desktop/src-tauri/gen')) return false;

	return true;
}

function getStagingRootEntries(options: ScaffoldOptions): string[] {
	const entries = new Set<string>();

	if (options.target === 'desktop' || options.target === 'both') {
		entries.add('desktop');
	}

	if (options.target === 'web-app' || options.target === 'both') {
		entries.add('web-app');
		entries.add('compose.yaml');
		entries.add('compose');
		entries.add('proto');
		entries.add('buf.yaml');
		entries.add('buf.gen.yaml');
	}

	if (options.withCi) {
		entries.add('.github/workflows');
		entries.add('.gitleaks.toml');
	}

	if (options.withDocs) {
		entries.add('AGENTS.md');
		entries.add('GEMINI.md');
		entries.add('docs');
	}

	return [...entries];
}

function getSelectedOutputEntries(options: ScaffoldOptions): string[] {
	const entries = new Set<string>();

	if (options.target === 'desktop' || options.target === 'both') {
		entries.add('desktop');
	}

	if (options.target === 'web-app' || options.target === 'both') {
		entries.add('web-app');
		entries.add('compose.yaml');
		if (options.variant === 'standard') {
			entries.add('compose');
			entries.add('proto');
			entries.add('buf.yaml');
			entries.add('buf.gen.yaml');
		} else if (options.keepApi) {
			entries.add('proto');
			entries.add('buf.yaml');
			entries.add('buf.gen.yaml');
		}
	}

	if (options.withCi) {
		entries.add('.gitleaks.toml');
		if (options.target === 'desktop') {
			entries.add('.github/workflows/secret-scan.yml');
		} else {
			entries.add('.github/workflows');
		}
	}

	if (options.withDocs) {
		entries.add('AGENTS.md');
		entries.add('GEMINI.md');
		entries.add('docs');
	}

	return [...entries];
}

function collectFilesRecursively(baseDir: string, entryRelPath: string): string[] {
	const fullPath = join(baseDir, entryRelPath);
	if (!existsSync(fullPath)) return [];

	const st = statSync(fullPath);
	if (!st.isDirectory()) {
		return [entryRelPath.replace(/\\/g, '/')];
	}

	const files: string[] = [];
	const children = readdirSync(fullPath).sort();
	for (const child of children) {
		const childRel = join(entryRelPath, child);
		files.push(...collectFilesRecursively(baseDir, childRel));
	}
	return files;
}

function createPreparedStagingTree(options: ScaffoldOptions): string {
	const templateRoot = realpathSync(resolve(options.templateRoot));
	const stagingDir = realpathSync(mkdtempSync(join(tmpdir(), 'agent-ready-app-scaffold-')));

	try {
		for (const rel of getStagingRootEntries(options)) {
			const src = join(templateRoot, rel);
			if (!existsSync(src)) continue;
			const dest = join(stagingDir, rel);
			mkdirSync(dirname(dest), { recursive: true });
			cpSync(src, dest, {
				recursive: true,
				filter: (p) => shouldIncludeTemplatePath(templateRoot, p)
			});
		}

		runInit({
			variant: options.variant,
			cloud: options.cloud,
			name: options.name,
			keepApi: options.variant === 'light' ? options.keepApi : false,
			dryRun: false,
			yes: true,
			rootDir: stagingDir
		});

		return stagingDir;
	} catch (err) {
		rmSync(stagingDir, { recursive: true, force: true });
		throw err;
	}
}

function assertSafeDestination(templateRoot: string, destDir: string): void {
	const resolvedTemplate = realpathSync(resolve(templateRoot));
	const resolvedDest = existsSync(destDir) ? realpathSync(resolve(destDir)) : resolve(destDir);
	if (resolvedDest === resolvedTemplate) {
		throw new Error(
			'Destination directory points to the template repository itself. Run this CLI from another directory (or pass --dir <path>), or use `bun run init` for in-place initialization.'
		);
	}
}

function planScaffoldFromStaging(stagingDir: string, options: ScaffoldOptions): PlannedCopyAction[] {
	const destRoot = resolve(options.destDir);
	const selectedEntries = getSelectedOutputEntries(options);
	const relFiles = new Set<string>();

	for (const entry of selectedEntries) {
		for (const file of collectFilesRecursively(stagingDir, entry)) {
			relFiles.add(file);
		}
	}

	const actions: PlannedCopyAction[] = [];
	for (const relPath of [...relFiles].sort()) {
		const srcPath = join(stagingDir, relPath);
		const destPath = join(destRoot, relPath);
		const alreadyExists = existsSync(destPath);
		const kind: PlannedCopyAction['kind'] = !alreadyExists
			? 'create'
			: options.force
				? 'overwrite'
				: 'skip';
		actions.push({ kind, relPath, srcPath, destPath });
	}

	return actions;
}

function applyCopyActions(actions: PlannedCopyAction[]): ScaffoldResult {
	let created = 0;
	let overwritten = 0;
	let skipped = 0;

	for (const action of actions) {
		if (action.kind === 'skip') {
			skipped += 1;
			continue;
		}
		mkdirSync(dirname(action.destPath), { recursive: true });
		cpSync(action.srcPath, action.destPath, { force: true });
		if (action.kind === 'create') {
			created += 1;
		} else {
			overwritten += 1;
		}
	}

	return { actions, created, overwritten, skipped };
}

function summarizeActions(actions: PlannedCopyAction[]): ScaffoldResult {
	let created = 0;
	let overwritten = 0;
	let skipped = 0;
	for (const action of actions) {
		if (action.kind === 'create') created += 1;
		else if (action.kind === 'overwrite') overwritten += 1;
		else skipped += 1;
	}
	return { actions, created, overwritten, skipped };
}

export function runScaffold(options: ScaffoldOptions): ScaffoldResult {
	assertSafeDestination(options.templateRoot, options.destDir);
	const stagingDir = createPreparedStagingTree(options);

	try {
		const actions = planScaffoldFromStaging(stagingDir, options);
		if (options.dryRun) {
			return summarizeActions(actions);
		}
		return applyCopyActions(actions);
	} finally {
		rmSync(stagingDir, { recursive: true, force: true });
	}
}

async function promptMissingScaffoldOptions(
	parsed: ParsedScaffoldArgs,
	templateRoot: string
): Promise<ScaffoldOptions> {
	const isInteractive = Boolean(stdin.isTTY && stdout.isTTY);
	const destDir = resolve(parsed.dir ?? process.cwd());

	let targetStr = parsed.target;
	let variantStr = parsed.variant;
	let nameStr = parsed.name;
	let keepApi = parsed.keepApi;
	let withCi = parsed.withCi;
	let withDocs = parsed.withDocs;

	const needsInteractivePrompt =
		!targetStr || (!variantStr && targetStr.trim().toLowerCase() !== 'desktop');

	if (needsInteractivePrompt) {
		if (!isInteractive) {
			if (!targetStr) {
				throw new Error(
					'Non-interactive shell requires --target=<web-app|desktop|both>. Run with --help for usage.'
				);
			}
			throw new Error(
				'Non-interactive shell requires --variant=<light|standard> when --target is web-app or both. Run with --help for usage.'
			);
		}

		const rl = createInterface({ input: stdin, output: stdout });
		try {
			console.log('\nagent-ready-app-template scaffold CLI\n');
			if (!targetStr) {
				console.log('  1) web-app - SvelteKit app + Terraform IaC + Compose (and Rust API for Standard)');
				console.log('  2) desktop - Tauri v2 desktop wrapper only');
				console.log('  3) both    - Web app + Tauri desktop wrapper\n');
				const targetAns = (await rl.question('Choose components to scaffold [web-app/desktop/both]: '))
					.trim()
					.toLowerCase();
				targetStr =
					targetAns === '1'
						? 'web-app'
						: targetAns === '2'
							? 'desktop'
							: targetAns === '3'
								? 'both'
								: targetAns;
			}

			const validatedTarget = validateTarget(targetStr);

			if (validatedTarget !== 'desktop' && !variantStr) {
				console.log('\n  1) light    - Single-container Cloud Run + Cloud Firestore (<$10/mo)');
				console.log('  2) standard - Cloud Run BFF + Rust Connect RPC API + PostgreSQL 18 RLS\n');
				const varAns = (await rl.question('Choose architecture variant [light/standard]: '))
					.trim()
					.toLowerCase();
				variantStr = varAns === '1' ? 'light' : varAns === '2' ? 'standard' : varAns;
			}

			if (!nameStr) {
				const nameAns = (
					await rl.question('App slug (optional, 3-18 lowercase chars, Enter to keep agent-ready-app): ')
				).trim();
				if (nameAns) nameStr = nameAns;
			}

			if (validatedTarget !== 'desktop' && variantStr === 'light' && !keepApi) {
				const keepAns = (
					await rl.question('Keep web-app/api/ & proto/ as reference examples? [y/N]: ')
				)
					.trim()
					.toLowerCase();
				keepApi = keepAns === 'y' || keepAns === 'yes';
			}

			if (!withCi) {
				const ciAns = (
					await rl.question('Also copy GitHub Actions workflows (.github/workflows/)? [y/N]: ')
				)
					.trim()
					.toLowerCase();
				withCi = ciAns === 'y' || ciAns === 'yes';
			}

			if (!withDocs) {
				const docsAns = (
					await rl.question('Also copy AGENTS.md, GEMINI.md, and docs/? [y/N]: ')
				)
					.trim()
					.toLowerCase();
				withDocs = docsAns === 'y' || docsAns === 'yes';
			}
		} finally {
			rl.close();
		}
	}

	const target = validateTarget(targetStr);
	const variant: ArchitectureVariant =
		target === 'desktop' ? 'light' : validateVariant(variantStr);
	const cloud = validateCloud(parsed.cloud);
	const name = nameStr ? validateAppName(nameStr) : undefined;

	return {
		target,
		variant,
		cloud,
		name,
		keepApi: target !== 'desktop' && variant === 'light' ? keepApi : false,
		withCi,
		withDocs,
		force: parsed.force,
		dryRun: parsed.dryRun,
		yes: parsed.yes,
		destDir,
		templateRoot
	};
}

function groupPreviewLines(actions: PlannedCopyAction[]): string[] {
	const lines: string[] = [];
	const createDirs = new Map<string, number>();

	for (const action of actions) {
		if (action.kind === 'create') {
			const top = action.relPath.includes('/')
				? `${action.relPath.split('/')[0]}/`
				: action.relPath;
			createDirs.set(top, (createDirs.get(top) ?? 0) + 1);
		}
	}

	for (const [top, count] of [...createDirs.entries()].sort()) {
		lines.push(
			top.endsWith('/')
				? `  [CREATE]    ${top} (${count} file${count === 1 ? '' : 's'})`
				: `  [CREATE]    ${top}`
		);
	}

	for (const action of actions) {
		if (action.kind === 'overwrite') {
			lines.push(`  [OVERWRITE] ${action.relPath}`);
		} else if (action.kind === 'skip') {
			lines.push(`  [SKIP]      ${action.relPath} (already exists; pass --force to overwrite)`);
		}
	}

	return lines;
}

async function main(): Promise<void> {
	const parsed = parseScaffoldArgs(process.argv.slice(2));
	if (parsed.help) {
		console.log(HELP_TEXT);
		return;
	}

	const templateRoot = resolve(import.meta.dir, '..');
	const options = await promptMissingScaffoldOptions(parsed, templateRoot);
	assertSafeDestination(options.templateRoot, options.destDir);

	const stagingDir = createPreparedStagingTree(options);
	try {
		const actions = planScaffoldFromStaging(stagingDir, options);
		const summary = summarizeActions(actions);

		const variantLabel = options.target === 'desktop' ? '' : `, variant="${options.variant}"`;
		const nameLabel = options.name ? `, name="${options.name}"` : '';
		const flags = [
			options.keepApi ? '--keep-api' : '',
			options.withCi ? '--with-ci' : '',
			options.withDocs ? '--with-docs' : '',
			options.force ? '--force' : '',
			options.dryRun ? '[DRY RUN]' : ''
		]
			.filter(Boolean)
			.join(' ');

		console.log(
			`\nScaffold plan: target="${options.target}"${variantLabel}, cloud="${options.cloud}"${nameLabel}${flags ? ` ${flags}` : ''}`
		);
		console.log(`Destination: ${options.destDir}\n`);

		for (const line of groupPreviewLines(actions)) {
			console.log(line);
		}

		console.log(
			`\nSummary: ${summary.created} to create, ${summary.overwritten} to overwrite, ${summary.skipped} skipped (conflict).`
		);

		if (options.dryRun) {
			console.log('\nDry run complete. No files were modified.');
			return;
		}

		if (summary.created === 0 && summary.overwritten === 0) {
			console.log('\nNothing to write (all target files already exist). Pass --force to overwrite.');
			return;
		}

		if (!options.yes) {
			if (!stdin.isTTY || !stdout.isTTY) {
				throw new Error(
					'Refusing to write files in non-interactive mode without --yes (or --dry-run).'
				);
			}
			const rl = createInterface({ input: stdin, output: stdout });
			try {
				const confirm = (await rl.question('\nApply these changes? [y/N]: ')).trim().toLowerCase();
				if (confirm !== 'y' && confirm !== 'yes') {
					console.log('Aborted. No files were modified.');
					return;
				}
			} finally {
				rl.close();
			}
		}

		const result = applyCopyActions(actions);

		console.log(
			`\nScaffold complete! (${result.created} created, ${result.overwritten} overwritten, ${result.skipped} skipped)\n`
		);
		console.log('Next steps:');
		let step = 1;
		if (options.target === 'web-app' || options.target === 'both') {
			console.log(`  ${step++}. Install & verify web-app/app:`);
			console.log(
				'       cd web-app/app && bun install && bun --bun run check && bun --bun run test:unit'
			);
			console.log(
				`  ${step++}. Start local ${options.variant === 'standard' ? 'PostgreSQL 18' : 'Firestore Emulator'}:`
			);
			console.log('       docker compose up -d');
			console.log(
				`  ${step++}. Copy web-app/app/.env.example to web-app/app/.env and start ${options.variant === 'standard' ? 'the Rust API + SvelteKit dev server' : 'the SvelteKit dev server'}.`
			);
		}
		if (options.target === 'desktop' || options.target === 'both') {
			console.log(`  ${step++}. Install & run desktop (Tauri v2):`);
			console.log('       cd desktop && bun install && bun run dev');
			if (options.target === 'desktop') {
				console.log(
					'       (Set LEAN_CLOUD_APP_URL=https://... to point the wrapper at an existing web app.)'
				);
			}
		}
		if (result.skipped > 0) {
			console.log(
				`  ${step}. Review the ${result.skipped} skipped conflicting file(s) listed above (re-run with --force if you want to overwrite them).`
			);
		}
	} finally {
		rmSync(stagingDir, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	main().catch((err: unknown) => {
		console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	});
}
