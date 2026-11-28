#!/usr/bin/env bun
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export type ArchitectureVariant = 'light' | 'standard';
export type CloudProvider = 'gcp';

export interface InitOptions {
	variant: ArchitectureVariant;
	cloud: CloudProvider;
	name?: string;
	keepApi: boolean;
	dryRun: boolean;
	yes: boolean;
	rootDir: string;
}

export interface ParsedCliArgs {
	variant?: string;
	cloud?: string;
	name?: string;
	keepApi: boolean;
	dryRun: boolean;
	yes: boolean;
	help: boolean;
	rootDir?: string;
}

export interface PlannedAction {
	kind: 'delete' | 'write' | 'promote';
	path: string;
	detail: string;
	execute: () => void;
}

const APP_NAME_PATTERN = /^[a-z][a-z0-9-]{2,17}$/;
const SUPPORTED_CLOUDS: readonly CloudProvider[] = ['gcp'];

const HELP_TEXT = `Usage: bun run init -- [options]

Initialize this repository from lean-cloud-app-template into a focused Light or Standard project.

Options:
  --variant <light|standard>  Target architecture variant (prompted interactively if omitted)
  --cloud <gcp>               Target cloud provider (default: gcp; AWS: #54, Azure: #55)
  --name <slug>               Optional app slug (3-18 lowercase alphanumeric/hyphen chars, e.g. my-app)
  --keep-api                  With --variant=light, keep web-app/api/ and proto/ as reference examples
  --dry-run                   Preview planned file changes without modifying anything
  -y, --yes                   Skip interactive confirmation prompt
  --root <path>               Override repository root directory (primarily for testing)
  -h, --help                  Show this help message

Examples:
  bun run init
  bun run init -- --variant=standard --name=my-saas-app --dry-run
  bun run init -- --variant=standard --name=my-saas-app --yes
  bun run init -- --variant=light --name=my-lean-app --yes
  bun run init -- --variant=light --keep-api --yes
`;

export function parseCliArgs(argv: string[]): ParsedCliArgs {
	const parsed: ParsedCliArgs = {
		keepApi: false,
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
		} else if (arg.startsWith('--root=')) {
			parsed.rootDir = arg.slice('--root='.length);
		} else if (arg === '--root') {
			parsed.rootDir = argv[++i];
		} else {
			throw new Error(`Unknown option: ${arg}. Run with --help for usage.`);
		}
	}

	return parsed;
}

export function validateAppName(name: string): string {
	const trimmed = name.trim();
	if (!APP_NAME_PATTERN.test(trimmed)) {
		throw new Error(
			`Invalid --name "${name}". Use 3-18 characters matching ^[a-z][a-z0-9-]{2,17}$ (matches GCP Terraform service_name constraints).`
		);
	}
	return trimmed;
}

export function validateVariant(variant: string | undefined): ArchitectureVariant {
	const normalized = variant?.trim().toLowerCase();
	if (normalized === 'light' || normalized === 'standard') {
		return normalized;
	}
	throw new Error(
		`Invalid or missing --variant "${variant ?? ''}". Expected "light" or "standard".`
	);
}

export function validateCloud(cloud: string | undefined): CloudProvider {
	const normalized = (cloud ?? 'gcp').trim().toLowerCase();
	if ((SUPPORTED_CLOUDS as readonly string[]).includes(normalized)) {
		return normalized as CloudProvider;
	}
	throw new Error(
		`Unsupported --cloud "${cloud}". Currently supported: ${SUPPORTED_CLOUDS.join(', ')} (AWS is tracked in #54; Azure is tracked in #55).`
	);
}

function toDisplayName(slug: string): string {
	return slug
		.split('-')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function toSnakeCase(slug: string): string {
	return slug.replace(/-/g, '_');
}

function toScheme(slug: string): string {
	return slug.replace(/[^a-z0-9]/g, '');
}

function lightBackendTs(): string {
	return `import { getServerConfig, type ServerConfig } from './env.js';
import { lightBackend } from './light/index.js';
import type {
	ApiCaller,
	AuthSessionStore,
	BackendAdapter,
	BackendAuthMode,
	BackendHealthResponse,
	LightDatastoreStatus,
	TenantSummary
} from './types.js';

/**
 * Light architecture BFF backend entry point (generated by \`bun run init --variant=light\`).
 */
export function getBackendAdapter(_config: ServerConfig = getServerConfig()): BackendAdapter {
	return lightBackend;
}

export function getBackendAuthMode(config: ServerConfig = getServerConfig()): BackendAuthMode {
	return getBackendAdapter(config).authMode;
}

export function createAuthSessionStore(
	config: ServerConfig = getServerConfig()
): Promise<AuthSessionStore> {
	return getBackendAdapter(config).createAuthSessionStore(config);
}

export function getBackendHealth(config: ServerConfig = getServerConfig()): BackendHealthResponse {
	return getBackendAdapter(config).getHealth(config);
}

export function getLightDatastoreStatus(
	config: ServerConfig = getServerConfig()
): LightDatastoreStatus {
	return getBackendAdapter(config).getLightDatastoreStatus(config);
}

export function resolveOptionalActiveTenant(
	user: ApiCaller,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<TenantSummary | null> {
	return getBackendAdapter(config).resolveOptionalActiveTenant(user, preferredTenantId, config);
}

export function formatBackendError(
	err: unknown,
	config: ServerConfig = getServerConfig()
): string {
	return getBackendAdapter(config).formatError(err, config);
}
`;
}

function standardBackendTs(): string {
	return `import { getServerConfig, type ServerConfig } from './env.js';
import { standardBackend } from './standard/index.js';
import type {
	ApiCaller,
	AuthSessionStore,
	BackendAdapter,
	BackendAuthMode,
	BackendHealthResponse,
	LightDatastoreStatus,
	TenantSummary
} from './types.js';

/**
 * Standard architecture BFF backend entry point (generated by \`bun run init --variant=standard\`).
 *
 * All business-domain operations go exclusively through \`./standard/api-client.ts\`
 * (Rust Connect RPC API -> PostgreSQL with RLS). Only Better Auth sessions touch the
 * PostgreSQL \`auth\` schema via \`./standard/auth-db.ts\`.
 */
export function getBackendAdapter(_config: ServerConfig = getServerConfig()): BackendAdapter {
	return standardBackend;
}

export function getBackendAuthMode(config: ServerConfig = getServerConfig()): BackendAuthMode {
	return getBackendAdapter(config).authMode;
}

export function createAuthSessionStore(
	config: ServerConfig = getServerConfig()
): Promise<AuthSessionStore> {
	return getBackendAdapter(config).createAuthSessionStore(config);
}

export function getBackendHealth(config: ServerConfig = getServerConfig()): BackendHealthResponse {
	return getBackendAdapter(config).getHealth(config);
}

export function getLightDatastoreStatus(
	config: ServerConfig = getServerConfig()
): LightDatastoreStatus {
	return getBackendAdapter(config).getLightDatastoreStatus(config);
}

export function resolveOptionalActiveTenant(
	user: ApiCaller,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<TenantSummary | null> {
	return getBackendAdapter(config).resolveOptionalActiveTenant(user, preferredTenantId, config);
}

export function formatBackendError(
	err: unknown,
	config: ServerConfig = getServerConfig()
): string {
	return getBackendAdapter(config).formatError(err, config);
}
`;
}

function lightEnvExample(): string {
	return `# Public / App URLs
PUBLIC_APP_URL=http://localhost:5173

# Better Auth (Stateless JWE Cookie in production)
BETTER_AUTH_URL=http://localhost:5173
BETTER_AUTH_SECRET=CHANGE_ME_GENERATE_32_BYTE_RANDOM_SECRET

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=CHANGE_ME_GOOGLE_CLIENT_SECRET

# Access Control (open | allowlist)
AUTH_ACCESS_MODE=allowlist
ALLOWED_EMAILS=
ALLOWED_DOMAINS=

# E2E Test Auth (keep false in production)
ENABLE_E2E_PASSWORD_AUTH=false
E2E_TEST_EMAIL=
E2E_TEST_PASSWORD=

# Architecture Variant
ARCHITECTURE_VARIANT=light

# Cloud Firestore (uses local emulator when FIRESTORE_EMULATOR_HOST is set)
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
FIRESTORE_EMULATOR_HOST=localhost:8080
`;
}

function standardEnvExample(): string {
	return `# Public / App URLs
PUBLIC_APP_URL=http://localhost:5173

# Better Auth (PostgreSQL DB Session in auth schema)
BETTER_AUTH_URL=http://localhost:5173
BETTER_AUTH_SECRET=CHANGE_ME_GENERATE_32_BYTE_RANDOM_SECRET

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=CHANGE_ME_GOOGLE_CLIENT_SECRET

# Access Control (open | allowlist)
AUTH_ACCESS_MODE=allowlist
ALLOWED_EMAILS=
ALLOWED_DOMAINS=

# E2E Test Auth (keep false in production)
ENABLE_E2E_PASSWORD_AUTH=false
E2E_TEST_EMAIL=
E2E_TEST_PASSWORD=

# Architecture Variant
ARCHITECTURE_VARIANT=standard

# Standard Architecture (Better Auth PG pool + internal Rust Connect RPC API)
# Local PostgreSQL from compose.yaml:
AUTH_DATABASE_URL=postgres://auth_user:CHANGE_ME_LOCAL_DEV_AUTH_PASSWORD@localhost:5432/app
API_BASE_URL=http://localhost:8081
API_AUDIENCE=
INTERNAL_API_JWT_SECRET=CHANGE_ME_GENERATE_32_BYTE_INTERNAL_JWT_SECRET
`;
}

function lightComposeYaml(): string {
	return `# Local development services (Light architecture — Firestore Emulator)
#
# Start:
#   docker compose up -d
#
# Windows with wslc (no compose subcommand):
#   wslc run -d --rm --name firestore-emulator -p 8080:8080 gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators gcloud emulators firestore start --host-port=0.0.0.0:8080

services:
  firestore-emulator:
    image: gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators
    ports:
      - "8080:8080"
    command:
      - gcloud
      - emulators
      - firestore
      - start
      - --host-port=0.0.0.0:8080
`;
}

function standardComposeYaml(): string {
	return `# Local development services (Standard architecture — PostgreSQL 18 with auth/app schemas & RLS roles)
#
# Start:
#   docker compose up -d
#
# Reset PostgreSQL volume (re-runs compose/postgres/init.sql):
#   docker compose down -v
#
# Windows with wslc (no compose subcommand):
#   wslc run -d --rm --name postgres -p 5432:5432 \\
#     -e POSTGRES_DB=app \\
#     -e POSTGRES_USER=migrator \\
#     -e POSTGRES_PASSWORD=local-dev-migrator-password \\
#     -v "$PWD/compose/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro" \\
#     postgres:18-alpine

services:
  postgres:
    image: postgres:18-alpine
    ports:
      - "5432:5432"
    environment:
      # Local development dummy credentials only — never use in production.
      POSTGRES_DB: app
      POSTGRES_USER: migrator
      POSTGRES_PASSWORD: local-dev-migrator-password
    volumes:
      # PostgreSQL 18+ official image stores PGDATA under /var/lib/postgresql/18/docker
      - postgres-data:/var/lib/postgresql
      - ./compose/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U migrator -d app"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres-data:
`;
}

function singleTerraformValidateWorkflow(variant: ArchitectureVariant): string {
	const label = variant === 'standard' ? 'Standard' : 'Light';
	return `name: Terraform Validate

on:
  push:
    branches: ["main"]
    paths:
      - "web-app/infra/gcp/**"
      - ".github/workflows/terraform-validate.yml"
  pull_request:
    paths:
      - "web-app/infra/gcp/**"
      - ".github/workflows/terraform-validate.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  validate:
    name: Format & Validate (GCP / ${label})
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web-app/infra/gcp
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v4

      - name: Terraform Format Check
        run: terraform fmt -check -recursive

      - name: Terraform Init (No Backend)
        run: terraform init -backend=false -input=false

      - name: Terraform Validate
        run: terraform validate -no-color
`;
}

function writeTextFile(filePath: string, content: string): void {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, content, 'utf8');
}

function updateJsonFile(filePath: string, mutator: (data: Record<string, unknown>) => void): void {
	const raw = readFileSync(filePath, 'utf8');
	const indent = raw.includes('\n\t') ? '\t' : 2;
	const parsed = JSON.parse(raw) as Record<string, unknown>;
	mutator(parsed);
	writeFileSync(filePath, `${JSON.stringify(parsed, null, indent)}\n`, 'utf8');
}

function promoteInfraDirectory(gcpRoot: string, selectedVariant: ArchitectureVariant): void {
	const selectedDir = join(gcpRoot, selectedVariant);
	const otherDir = join(gcpRoot, selectedVariant === 'light' ? 'standard' : 'light');

	if (existsSync(otherDir)) {
		rmSync(otherDir, { recursive: true, force: true });
	}
	if (!existsSync(selectedDir)) {
		return;
	}

	const indexReadme = join(gcpRoot, 'README.md');
	if (existsSync(indexReadme)) {
		rmSync(indexReadme, { force: true });
	}

	for (const entry of readdirSync(selectedDir)) {
		const src = join(selectedDir, entry);
		const dest = join(gcpRoot, entry);
		const st = statSync(src);
		if (st.isDirectory()) {
			// Copy recursively (not expected today, kept safe)
			mkdirSync(dest, { recursive: true });
			for (const child of readdirSync(src)) {
				const childSrc = join(src, child);
				const childDest = join(dest, child);
				writeFileSync(childDest, readFileSync(childSrc));
			}
		} else {
			let content = readFileSync(src, 'utf8');
			if (entry === 'README.md') {
				content = content
					.replaceAll('../../../../docs/', '../../../docs/')
					.replaceAll(`web-app/infra/gcp/${selectedVariant}`, 'web-app/infra/gcp');
			}
			writeFileSync(dest, content, 'utf8');
		}
	}

	rmSync(selectedDir, { recursive: true, force: true });
}

export function buildInitPlan(options: InitOptions): PlannedAction[] {
	const root = resolve(options.rootDir);
	const actions: PlannedAction[] = [];

	const addDelete = (relPath: string, detail: string) => {
		const fullPath = join(root, relPath);
		if (existsSync(fullPath)) {
			actions.push({
				kind: 'delete',
				path: relPath,
				detail,
				execute: () => rmSync(fullPath, { recursive: true, force: true })
			});
		}
	};

	const addWrite = (relPath: string, detail: string, execute: () => void) => {
		actions.push({ kind: 'write', path: relPath, detail, execute });
	};

	const appPkgPath = join(root, 'web-app/app/package.json');
	const backendPath = join(root, 'web-app/app/src/lib/server/backend.ts');
	const envPath = join(root, 'web-app/app/src/lib/server/env.ts');
	const envExamplePath = join(root, 'web-app/app/.env.example');
	const composePath = join(root, 'compose.yaml');
	const tfValidatePath = join(root, '.github/workflows/terraform-validate.yml');
	const gcpInfraRoot = join(root, 'web-app/infra/gcp');

	if (options.variant === 'standard') {
		// 1. Prune Light-only BFF code & tests (no direct Firestore CRUD from BFF!)
		addDelete(
			'web-app/app/src/lib/server/light',
			'Remove Light direct-datastore BFF adapter (Cloud Firestore CRUD)'
		);
		addDelete('web-app/app/tests/server/light', 'Remove Light-only BFF unit tests');

		addWrite(
			'web-app/app/src/lib/server/backend.ts',
			'Lock BFF backend entry point to Standard adapter only',
			() => writeTextFile(backendPath, standardBackendTs())
		);

		if (existsSync(envPath)) {
			addWrite(
				'web-app/app/src/lib/server/env.ts',
				'Set DEFAULT_ARCHITECTURE_VARIANT to "standard"',
				() => {
					const src = readFileSync(envPath, 'utf8');
					const updated = src.replace(
						/export const DEFAULT_ARCHITECTURE_VARIANT: ArchitectureVariant = '(light|standard)';/,
						"export const DEFAULT_ARCHITECTURE_VARIANT: ArchitectureVariant = 'standard';"
					);
					writeFileSync(envPath, updated, 'utf8');
				}
			);
		}

		if (existsSync(appPkgPath)) {
			addWrite(
				'web-app/app/package.json',
				'Remove @google-cloud/firestore dependency',
				() => {
					updateJsonFile(appPkgPath, (pkg) => {
						const deps = pkg.dependencies as Record<string, string> | undefined;
						if (deps) {
							delete deps['@google-cloud/firestore'];
						}
					});
				}
			);
		}

		addWrite(
			'web-app/app/.env.example',
			'Write Standard-only environment variable template',
			() => writeTextFile(envExamplePath, standardEnvExample())
		);

		addWrite('compose.yaml', 'Switch default Compose stack to PostgreSQL 18 (Standard)', () =>
			writeTextFile(composePath, standardComposeYaml())
		);

		if (existsSync(join(gcpInfraRoot, 'standard'))) {
			actions.push({
				kind: 'promote',
				path: 'web-app/infra/gcp',
				detail: 'Promote web-app/infra/gcp/standard/ -> web-app/infra/gcp/ and remove light/',
				execute: () => promoteInfraDirectory(gcpInfraRoot, 'standard')
			});
		}

		addDelete('.github/workflows/deploy-gcp.yml', 'Remove Light-only GCP deploy workflow');

		const stdDeployPath = join(root, '.github/workflows/deploy-gcp-standard.yml');
		if (existsSync(stdDeployPath)) {
			addWrite(
				'.github/workflows/deploy-gcp-standard.yml',
				'Update promoted Terraform README path',
				() => {
					const src = readFileSync(stdDeployPath, 'utf8');
					writeFileSync(
						stdDeployPath,
						src.replaceAll('web-app/infra/gcp/standard/README.md', 'web-app/infra/gcp/README.md'),
						'utf8'
					);
				}
			);
		}

		addWrite(
			'.github/workflows/terraform-validate.yml',
			'Simplify Terraform CI workflow to validate web-app/infra/gcp',
			() => writeTextFile(tfValidatePath, singleTerraformValidateWorkflow('standard'))
		);
	} else {
		// Light variant
		addDelete(
			'web-app/app/src/lib/server/standard',
			'Remove Standard BFF adapter (Connect RPC client, internal JWT, PG auth pool)'
		);
		addDelete('web-app/app/src/lib/gen', 'Remove generated Connect RPC / Protobuf stubs');
		addDelete('web-app/app/tests/server/standard', 'Remove Standard-only BFF unit tests');

		addWrite(
			'web-app/app/src/lib/server/backend.ts',
			'Lock BFF backend entry point to Light adapter only',
			() => writeTextFile(backendPath, lightBackendTs())
		);

		if (existsSync(envPath)) {
			addWrite(
				'web-app/app/src/lib/server/env.ts',
				'Ensure DEFAULT_ARCHITECTURE_VARIANT is "light"',
				() => {
					const src = readFileSync(envPath, 'utf8');
					const updated = src.replace(
						/export const DEFAULT_ARCHITECTURE_VARIANT: ArchitectureVariant = '(light|standard)';/,
						"export const DEFAULT_ARCHITECTURE_VARIANT: ArchitectureVariant = 'light';"
					);
					writeFileSync(envPath, updated, 'utf8');
				}
			);
		}

		if (existsSync(appPkgPath)) {
			addWrite(
				'web-app/app/package.json',
				'Remove Standard-only packages (pg, @types/pg, @connectrpc/*, @bufbuild/*)',
				() => {
					updateJsonFile(appPkgPath, (pkg) => {
						const deps = pkg.dependencies as Record<string, string> | undefined;
						if (deps) {
							delete deps.pg;
							delete deps['@connectrpc/connect'];
							delete deps['@connectrpc/connect-web'];
							delete deps['@bufbuild/protobuf'];
						}
						const devDeps = pkg.devDependencies as Record<string, string> | undefined;
						if (devDeps) {
							delete devDeps['@types/pg'];
							delete devDeps['@bufbuild/protoc-gen-es'];
						}
					});
				}
			);
		}

		addWrite('web-app/app/.env.example', 'Write Light-only environment variable template', () =>
			writeTextFile(envExamplePath, lightEnvExample())
		);

		addWrite('compose.yaml', 'Keep Firestore Emulator only in Compose stack', () =>
			writeTextFile(composePath, lightComposeYaml())
		);
		addDelete('compose', 'Remove PostgreSQL init scripts');

		if (!options.keepApi) {
			addDelete('web-app/api', 'Remove Standard Rust Connect RPC API');
			addDelete('proto', 'Remove Protobuf definitions');
			addDelete('buf.yaml', 'Remove Buf workspace config');
			addDelete('buf.gen.yaml', 'Remove Buf codegen config');
			addDelete('.github/workflows/rust-api-ci.yml', 'Remove Rust API CI workflow');
		}

		if (existsSync(join(gcpInfraRoot, 'light'))) {
			actions.push({
				kind: 'promote',
				path: 'web-app/infra/gcp',
				detail: 'Promote web-app/infra/gcp/light/ -> web-app/infra/gcp/ and remove standard/',
				execute: () => promoteInfraDirectory(gcpInfraRoot, 'light')
			});
		}

		addDelete(
			'.github/workflows/deploy-gcp-standard.yml',
			'Remove Standard-only GCP deploy workflow'
		);
		addWrite(
			'.github/workflows/terraform-validate.yml',
			'Simplify Terraform CI workflow to validate web-app/infra/gcp',
			() => writeTextFile(tfValidatePath, singleTerraformValidateWorkflow('light'))
		);
	}

	// Optional application rename (--name=<slug>)
	if (options.name) {
		const slug = options.name;
		const display = toDisplayName(slug);
		const snake = toSnakeCase(slug);
		const scheme = toScheme(slug);

		if (existsSync(appPkgPath)) {
			addWrite('web-app/app/package.json', `Set package name to "${slug}"`, () => {
				updateJsonFile(appPkgPath, (pkg) => {
					pkg.name = slug;
				});
			});
		}

		const apiCargoPath = join(root, 'web-app/api/Cargo.toml');
		const willKeepApi = options.variant === 'standard' || options.keepApi;
		if (willKeepApi && existsSync(apiCargoPath)) {
			addWrite('web-app/api/Cargo.toml', `Set Rust API crate name to "${slug}-api"`, () => {
				const src = readFileSync(apiCargoPath, 'utf8');
				writeFileSync(
					apiCargoPath,
					src.replace(/^name = "lean-cloud-app-api"/m, `name = "${slug}-api"`),
					'utf8'
				);
			});
		}

		const desktopPkgPath = join(root, 'desktop/package.json');
		if (existsSync(desktopPkgPath)) {
			addWrite('desktop/package.json', `Set desktop package name to "${slug}-desktop"`, () => {
				updateJsonFile(desktopPkgPath, (pkg) => {
					pkg.name = `${slug}-desktop`;
				});
			});
		}

		const desktopCargoPath = join(root, 'desktop/src-tauri/Cargo.toml');
		if (existsSync(desktopCargoPath)) {
			addWrite(
				'desktop/src-tauri/Cargo.toml',
				`Update Tauri crate/lib names to "${slug}-desktop"`,
				() => {
					const src = readFileSync(desktopCargoPath, 'utf8');
					const updated = src
						.replace(/^name = "lean-cloud-app-desktop"/m, `name = "${slug}-desktop"`)
						.replace(/^name = "lean_cloud_app_desktop_lib"/m, `name = "${snake}_desktop_lib"`)
						.replace(
							/^description = "Tauri v2 desktop wrapper for lean-cloud-app"/m,
							`description = "Tauri v2 desktop wrapper for ${slug}"`
						);
					writeFileSync(desktopCargoPath, updated, 'utf8');
				}
			);
		}

		const tauriConfPath = join(root, 'desktop/src-tauri/tauri.conf.json');
		if (existsSync(tauriConfPath)) {
			addWrite(
				'desktop/src-tauri/tauri.conf.json',
				`Update Tauri productName ("${display}"), identifier, and deep-link scheme ("${scheme}")`,
				() => {
					updateJsonFile(tauriConfPath, (conf) => {
						conf.productName = display;
						conf.identifier = `com.example.${slug}`;
						const plugins = conf.plugins as
							| { 'deep-link'?: { desktop?: { schemes?: string[] } } }
							| undefined;
						if (plugins?.['deep-link']?.desktop) {
							plugins['deep-link'].desktop.schemes = [scheme];
						}
					});
				}
			);
		}

		// Infra files (operate on promoted web-app/infra/gcp/)
		addWrite(
			'web-app/infra/gcp/terraform.tfvars.example',
			`Set default service_name to "${slug}"`,
			() => {
				const tfvarsPath = join(gcpInfraRoot, 'terraform.tfvars.example');
				if (existsSync(tfvarsPath)) {
					const src = readFileSync(tfvarsPath, 'utf8');
					writeFileSync(
						tfvarsPath,
						src.replace(/^service_name\s*=\s*"lean-cloud-app"/m, `service_name = "${slug}"`),
						'utf8'
					);
				}
			}
		);

		addWrite('web-app/infra/gcp/variables.tf', `Set service_name default to "${slug}"`, () => {
			const varsPath = join(gcpInfraRoot, 'variables.tf');
			if (existsSync(varsPath)) {
				const src = readFileSync(varsPath, 'utf8');
				writeFileSync(
					varsPath,
					src.replace(/default\s*=\s*"lean-cloud-app"/, `default     = "${slug}"`),
					'utf8'
				);
			}
		});

		const deployWorkflowRel =
			options.variant === 'standard'
				? '.github/workflows/deploy-gcp-standard.yml'
				: '.github/workflows/deploy-gcp.yml';
		const deployWorkflowPath = join(root, deployWorkflowRel);
		if (existsSync(deployWorkflowPath)) {
			addWrite(deployWorkflowRel, `Set fallback GCP_SERVICE_NAME to "${slug}"`, () => {
				const src = readFileSync(deployWorkflowPath, 'utf8');
				writeFileSync(deployWorkflowPath, src.replaceAll("'lean-cloud-app'", `'${slug}'`), 'utf8');
			});
		}
	}

	return actions;
}

export function runInit(options: InitOptions): PlannedAction[] {
	const plan = buildInitPlan(options);
	if (!options.dryRun) {
		for (const action of plan) {
			action.execute();
		}
	}
	return plan;
}

async function promptMissingOptions(
	parsed: ParsedCliArgs,
	defaultRoot: string
): Promise<InitOptions> {
	const isInteractive = Boolean(stdin.isTTY && stdout.isTTY);
	const rootDir = resolve(parsed.rootDir ?? defaultRoot);

	let variantStr = parsed.variant;
	let nameStr = parsed.name;
	let keepApi = parsed.keepApi;

	if (!variantStr) {
		if (!isInteractive) {
			throw new Error(
				'Non-interactive shell requires --variant=light or --variant=standard. Run with --help for usage.'
			);
		}
		const rl = createInterface({ input: stdin, output: stdout });
		try {
			console.log('\nlean-cloud-app-template initializer\n');
			console.log('  1) light    - Single-container Cloud Run + Cloud Firestore (<$10/mo)');
			console.log('  2) standard - Cloud Run BFF + Rust Connect RPC API + PostgreSQL 18 RLS\n');
			const answer = (await rl.question('Choose architecture variant [light/standard]: '))
				.trim()
				.toLowerCase();
			variantStr = answer === '1' ? 'light' : answer === '2' ? 'standard' : answer;

			if (!nameStr) {
				const nameAnswer = (
					await rl.question('App slug (optional, 3-18 lowercase chars, Enter to keep lean-cloud-app): ')
				).trim();
				if (nameAnswer) {
					nameStr = nameAnswer;
				}
			}

			if (variantStr === 'light' && !keepApi) {
				const keepAnswer = (
					await rl.question('Keep web-app/api/ & proto/ as reference examples? [y/N]: ')
				)
					.trim()
					.toLowerCase();
				keepApi = keepAnswer === 'y' || keepAnswer === 'yes';
			}
		} finally {
			rl.close();
		}
	}

	const variant = validateVariant(variantStr);
	const cloud = validateCloud(parsed.cloud);
	const name = nameStr ? validateAppName(nameStr) : undefined;

	return {
		variant,
		cloud,
		name,
		keepApi: variant === 'light' ? keepApi : false,
		dryRun: parsed.dryRun,
		yes: parsed.yes,
		rootDir
	};
}

async function main(): Promise<void> {
	const parsed = parseCliArgs(process.argv.slice(2));
	if (parsed.help) {
		console.log(HELP_TEXT);
		return;
	}

	const defaultRoot = resolve(import.meta.dir, '..');
	const options = await promptMissingOptions(parsed, defaultRoot);
	const plan = buildInitPlan(options);

	console.log(
		`\nPlan for variant="${options.variant}", cloud="${options.cloud}"${options.name ? `, name="${options.name}"` : ''}${options.keepApi ? ' (--keep-api)' : ''}${options.dryRun ? ' [DRY RUN]' : ''}:`
	);
	console.log(`Target root: ${relative(process.cwd(), options.rootDir) || '.'}\n`);

	for (const action of plan) {
		const tag =
			action.kind === 'delete' ? '[DELETE] ' : action.kind === 'promote' ? '[PROMOTE]' : '[WRITE]  ';
		console.log(`  ${tag} ${action.path} — ${action.detail}`);
	}

	if (options.dryRun) {
		console.log('\nDry run complete. No files were modified.');
		return;
	}

	if (!options.yes) {
		if (!stdin.isTTY || !stdout.isTTY) {
			throw new Error('Refusing to modify files in non-interactive mode without --yes (or --dry-run).');
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

	for (const action of plan) {
		action.execute();
	}

	console.log('\nInitialization complete!\n');
	console.log('Next steps:');
	console.log('  1. Sync lockfile & verify web-app/app:');
	console.log('       cd web-app/app && bun install && bun --bun run check && bun --bun run test:unit');
	if (options.variant === 'standard') {
		console.log('  2. Start local PostgreSQL 18:');
		console.log('       docker compose up -d');
		console.log('  3. Configure web-app/app/.env and start the Rust API + SvelteKit dev server.');
	} else {
		console.log('  2. Start local Firestore Emulator:');
		console.log('       docker compose up -d');
		console.log('  3. Configure web-app/app/.env and start the SvelteKit dev server.');
	}
}

if (import.meta.main) {
	main().catch((err: unknown) => {
		console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	});
}
