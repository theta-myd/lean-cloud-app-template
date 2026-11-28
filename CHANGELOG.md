# Changelog

All notable changes to **lean-cloud-app-template** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- AWS Light & Standard support with AWS CDK ([#54](https://github.com/theta-myd/lean-cloud-app-template/issues/54))
- Azure Light & Standard support with Azure Bicep ([#55](https://github.com/theta-myd/lean-cloud-app-template/issues/55))

## [0.1.0] - 2026-11-28

First public release establishing both **Light** (`<$10/month`, scale-to-zero) and **Standard** (multi-service Rust Connect RPC + PostgreSQL 18 RLS) architectures on Google Cloud (`asia-northeast1`), verified end-to-end on live Google Cloud infrastructure.

### Added

- **Web App & Modular BFF (`web-app/app/`):**
  - Svelte 5 + SvelteKit 3 (`@sveltejs/adapter-bun`), `shadcn-svelte` (`sidebar-07` Home / `login-03` Login), `mode-watcher` (`light` / `dark` / `system`), and hardened `oven/bun:distroless` container image (`USER nonroot`).
  - Better Auth + Google OAuth 2.0 with `AUTH_ACCESS_MODE` (`allowlist` | `open`), CSP/HSTS security headers, and env-gated local/E2E auth (`ENABLE_E2E_PASSWORD_AUTH=false` in production).
  - Clean 3-layer BFF structure under `src/lib/server/`: Core (`backend.ts`, `auth.ts`, `todos-repo.ts`, `env.ts`), Light (`light/gcp/firestore.ts` with Stateless JWE Cookies + Cloud Firestore), and Standard (`standard/` with PostgreSQL `auth` schema sessions + `pg.Pool` idle error resilience, Connect RPC client, short-lived HS256 `x-app-user-token`, and GCP OIDC ID token helper).
  - `/todos` sample CRUD page with tenant switcher in Standard mode, `/licenses` OSS notice page, and custom app/favicon icon assets.
- **Rust Backend API & Contracts (`web-app/api/`, `proto/`):**
  - Buf v2 Protobuf definitions (`TenantService`, `TodoService`) and generated TypeScript/Rust stubs.
  - Rust Connect RPC + Axum + `sqlx` service with Better Auth `auth.*` & tenant-scoped `app.*` migrations, `ENABLE` + `FORCE ROW LEVEL SECURITY`, `SECURITY DEFINER` tenant helpers, `--migrate-only` CLI mode, and distroless container image.
- **Tauri v2 Desktop Wrapper (`desktop/`):**
  - Desktop wrapper delegating Google OAuth to the OS browser with Deep Link callback and bundled app icons.
- **Google Cloud Terraform IaC (`web-app/infra/gcp/`):**
  - `light/`: Scale-to-zero Cloud Run v2, Cloud Firestore (Native Mode), Artifact Registry cleanup policies, two-step Secret Manager bootstrap, keyless GitHub Actions WIF (OIDC), and Billing Budget alerts.
  - `standard/`: Custom VPC, Private Services Access, Private Cloud DNS (`run.app.` -> `private.googleapis.com`), Private-IP-only Cloud SQL for PostgreSQL 18, Direct VPC Egress (`PRIVATE_RANGES_ONLY`), public `app` + internal-only `api` + `migrate` Job on Cloud Run v2, least-privilege SAs & Secret Manager bindings, and WIF (OIDC).
- **Template Initializer (`scripts/init.ts`, `bun run init`):**
  - Interactive and CLI template switcher (`--variant=light|standard`, `--cloud=gcp`, `--name=<slug>`, `--keep-api`, `--dry-run`, `--yes`) that cleanly prunes unused BFF layers, packages, Terraform modules, and workflows, backed by E2E tests (`bun run test:init`).
- **CI/CD & Documentation:**
  - GitHub Actions workflows for Web App CI (check, unit tests, build, Playwright E2E, Docker), Rust API CI (fmt, clippy, RLS integration tests against PostgreSQL 18), Terraform Validate matrix, Gitleaks secret scanning, and keyless GCP deploys (`deploy-gcp.yml`, `deploy-gcp-standard.yml`).
  - Architecture diagrams (`docs/architecture/gcp/`), OKF v0.3 ADRs (`ADR-0001`, `ADR-0002`), synchronized Japanese documentation (`docs/jp/`), `.github/release.yml`, and repository release policy (`AGENTS.md §7`).

[Unreleased]: https://github.com/theta-myd/lean-cloud-app-template/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/theta-myd/lean-cloud-app-template/releases/tag/v0.1.0
