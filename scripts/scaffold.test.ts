import { describe, expect, it } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseScaffoldArgs, runScaffold, validateTarget } from './scaffold.ts';

const REPO_ROOT = resolve(import.meta.dir, '..');

function createEmptyTargetDir(): string {
	return realpathSync(mkdtempSync(join(tmpdir(), 'agent-ready-app-dest-')));
}

function runCmd(cmd: string[], cwd: string): { exitCode: number; stdout: string; stderr: string } {
	const proc = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
	return {
		exitCode: proc.exitCode,
		stdout: new TextDecoder().decode(proc.stdout),
		stderr: new TextDecoder().decode(proc.stderr)
	};
}

describe('scripts/scaffold CLI parsing & validation', () => {
	it('parses target, variant, flags, and validates target values', () => {
		const parsed = parseScaffoldArgs([
			'--target=web-app',
			'--variant=light',
			'--name=my-app',
			'--dir=./out',
			'--with-ci',
			'--with-docs',
			'--force',
			'--dry-run',
			'--yes'
		]);

		expect(parsed).toMatchObject({
			target: 'web-app',
			variant: 'light',
			name: 'my-app',
			dir: './out',
			withCi: true,
			withDocs: true,
			force: true,
			dryRun: true,
			yes: true
		});

		expect(validateTarget('WEB-APP')).toBe('web-app');
		expect(validateTarget('desktop')).toBe('desktop');
		expect(validateTarget('both')).toBe('both');
		expect(() => validateTarget('mobile')).toThrow();
	});
});

describe('scripts/scaffold end-to-end placement into existing repositories', () => {
	it('scaffolds web-app only (light) without desktop or CI/docs by default', () => {
		const destDir = createEmptyTargetDir();
		try {
			writeFileSync(join(destDir, 'README.md'), '# Existing Project\n', 'utf8');

			const result = runScaffold({
				target: 'web-app',
				variant: 'light',
				cloud: 'gcp',
				name: 'demo-web',
				keepApi: false,
				withCi: false,
				withDocs: false,
				force: false,
				dryRun: false,
				yes: true,
				destDir,
				templateRoot: REPO_ROOT
			});

			expect(result.created).toBeGreaterThan(0);
			expect(result.skipped).toBe(0);

			// Existing project file untouched
			expect(readFileSync(join(destDir, 'README.md'), 'utf8')).toBe('# Existing Project\n');

			// web-app (Light) + compose.yaml placed
			expect(existsSync(join(destDir, 'web-app/app/package.json'))).toBe(true);
			expect(existsSync(join(destDir, 'web-app/app/.env.example'))).toBe(true);
			expect(existsSync(join(destDir, 'web-app/app/src/lib/server/light'))).toBe(true);
			expect(existsSync(join(destDir, 'web-app/app/src/lib/server/standard'))).toBe(false);
			expect(existsSync(join(destDir, 'web-app/api'))).toBe(false);
			expect(existsSync(join(destDir, 'web-app/infra/gcp/firestore.tf'))).toBe(true);
			expect(existsSync(join(destDir, 'web-app/infra/gcp/light'))).toBe(false);
			expect(existsSync(join(destDir, 'compose.yaml'))).toBe(true);

			// desktop, CI, docs NOT placed
			expect(existsSync(join(destDir, 'desktop'))).toBe(false);
			expect(existsSync(join(destDir, '.github'))).toBe(false);
			expect(existsSync(join(destDir, 'AGENTS.md'))).toBe(false);
			expect(existsSync(join(destDir, 'docs'))).toBe(false);

			const appPkg = JSON.parse(
				readFileSync(join(destDir, 'web-app/app/package.json'), 'utf8')
			) as { name: string };
			expect(appPkg.name).toBe('demo-web');
		} finally {
			rmSync(destDir, { recursive: true, force: true });
		}
	});

	it('scaffolds desktop only and renames Rust entrypoint and deep-link scheme consistently', () => {
		const destDir = createEmptyTargetDir();
		try {
			const result = runScaffold({
				target: 'desktop',
				variant: 'light',
				cloud: 'gcp',
				name: 'my-desk',
				keepApi: false,
				withCi: false,
				withDocs: false,
				force: false,
				dryRun: false,
				yes: true,
				destDir,
				templateRoot: REPO_ROOT
			});

			expect(result.created).toBeGreaterThan(0);
			expect(existsSync(join(destDir, 'desktop/package.json'))).toBe(true);
			expect(existsSync(join(destDir, 'desktop/src-tauri/tauri.conf.json'))).toBe(true);
			expect(existsSync(join(destDir, 'web-app'))).toBe(false);
			expect(existsSync(join(destDir, 'compose.yaml'))).toBe(false);
			expect(existsSync(join(destDir, '.github'))).toBe(false);

			const tauriConf = JSON.parse(
				readFileSync(join(destDir, 'desktop/src-tauri/tauri.conf.json'), 'utf8')
			) as {
				productName: string;
				identifier: string;
				plugins: { 'deep-link': { desktop: { schemes: string[] } } };
			};
			expect(tauriConf.productName).toBe('My Desk');
			expect(tauriConf.identifier).toBe('com.example.my-desk');
			expect(tauriConf.plugins['deep-link'].desktop.schemes).toEqual(['mydesk']);

			const mainRs = readFileSync(join(destDir, 'desktop/src-tauri/src/main.rs'), 'utf8');
			expect(mainRs).toContain('my_desk_desktop_lib::run()');

			const configRs = readFileSync(join(destDir, 'desktop/src-tauri/src/config.rs'), 'utf8');
			expect(configRs).toContain('pub const DEEP_LINK_SCHEME: &str = "mydesk";');

			const deepLinkRs = readFileSync(join(destDir, 'desktop/src-tauri/src/deep_link.rs'), 'utf8');
			expect(deepLinkRs).toContain('mydesk://auth/callback');
			expect(deepLinkRs).not.toContain('agentreadyapp://');
		} finally {
			rmSync(destDir, { recursive: true, force: true });
		}
	});

	it('scaffolds both (standard) with --with-ci and --with-docs', () => {
		const destDir = createEmptyTargetDir();
		try {
			const result = runScaffold({
				target: 'both',
				variant: 'standard',
				cloud: 'gcp',
				name: 'demo-saas',
				keepApi: false,
				withCi: true,
				withDocs: true,
				force: false,
				dryRun: false,
				yes: true,
				destDir,
				templateRoot: REPO_ROOT
			});

			expect(result.created).toBeGreaterThan(0);
			expect(existsSync(join(destDir, 'web-app/app/src/lib/server/standard'))).toBe(true);
			expect(existsSync(join(destDir, 'web-app/api/Cargo.toml'))).toBe(true);
			expect(existsSync(join(destDir, 'proto/todo/v1/todo.proto'))).toBe(true);
			expect(existsSync(join(destDir, 'compose/postgres/init.sql'))).toBe(true);
			expect(existsSync(join(destDir, 'desktop/src-tauri/Cargo.toml'))).toBe(true);
			expect(existsSync(join(destDir, '.github/workflows/deploy-gcp-standard.yml'))).toBe(true);
			expect(existsSync(join(destDir, '.github/workflows/deploy-gcp.yml'))).toBe(false);
			expect(existsSync(join(destDir, '.gitleaks.toml'))).toBe(true);
			expect(existsSync(join(destDir, 'AGENTS.md'))).toBe(true);
			expect(existsSync(join(destDir, 'docs/adr/index.md'))).toBe(true);
		} finally {
			rmSync(destDir, { recursive: true, force: true });
		}
	});

	it('skips conflicting files by default and overwrites only with --force', () => {
		const destDir = createEmptyTargetDir();
		try {
			writeFileSync(join(destDir, 'compose.yaml'), '# custom compose\n', 'utf8');
			mkdirSync(join(destDir, 'desktop'), { recursive: true });
			writeFileSync(join(destDir, 'desktop/README.md'), '# custom desktop readme\n', 'utf8');

			// Dry run leaves destination untouched
			const dryRes = runScaffold({
				target: 'both',
				variant: 'light',
				cloud: 'gcp',
				keepApi: false,
				withCi: false,
				withDocs: false,
				force: false,
				dryRun: true,
				yes: true,
				destDir,
				templateRoot: REPO_ROOT
			});
			expect(dryRes.skipped).toBe(2);
			expect(existsSync(join(destDir, 'web-app'))).toBe(false);

			// Real run without --force preserves existing files
			const safeRes = runScaffold({
				target: 'both',
				variant: 'light',
				cloud: 'gcp',
				keepApi: false,
				withCi: false,
				withDocs: false,
				force: false,
				dryRun: false,
				yes: true,
				destDir,
				templateRoot: REPO_ROOT
			});
			expect(safeRes.skipped).toBe(2);
			expect(readFileSync(join(destDir, 'compose.yaml'), 'utf8')).toBe('# custom compose\n');
			expect(readFileSync(join(destDir, 'desktop/README.md'), 'utf8')).toBe(
				'# custom desktop readme\n'
			);

			// Re-run with --force overwrites conflicts
			const forceRes = runScaffold({
				target: 'desktop',
				variant: 'light',
				cloud: 'gcp',
				keepApi: false,
				withCi: false,
				withDocs: false,
				force: true,
				dryRun: false,
				yes: true,
				destDir,
				templateRoot: REPO_ROOT
			});
			expect(forceRes.overwritten).toBeGreaterThan(0);
			expect(readFileSync(join(destDir, 'desktop/README.md'), 'utf8')).not.toBe(
				'# custom desktop readme\n'
			);
		} finally {
			rmSync(destDir, { recursive: true, force: true });
		}
	});

	it('refuses to scaffold directly into the template repository itself', () => {
		expect(() =>
			runScaffold({
				target: 'desktop',
				variant: 'light',
				cloud: 'gcp',
				keepApi: false,
				withCi: false,
				withDocs: false,
				force: false,
				dryRun: true,
				yes: true,
				destDir: REPO_ROOT,
				templateRoot: REPO_ROOT
			})
		).toThrow('template repository itself');
	});

	it('executes via CLI entrypoint without requiring --variant for --target=desktop', () => {
		const destDir = createEmptyTargetDir();
		try {
			const res = runCmd(
				['bun', join(REPO_ROOT, 'scripts/scaffold.ts'), '--target=desktop', '--name=cli-test', '--yes'],
				destDir
			);
			if (res.exitCode !== 0) {
				throw new Error(`CLI failed:\n${res.stdout}\n${res.stderr}`);
			}
			expect(res.stdout).toContain('Scaffold complete!');
			expect(existsSync(join(destDir, 'desktop/src-tauri/tauri.conf.json'))).toBe(true);
			expect(existsSync(join(destDir, 'web-app'))).toBe(false);
		} finally {
			rmSync(destDir, { recursive: true, force: true });
		}
	});
});
