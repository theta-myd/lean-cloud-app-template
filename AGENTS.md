# Repository Rules & Agent Guidelines

This file defines shared rules for all AI coding agents and contributors working in **lean-cloud-app-template**.

---

## 1. Project Scope & Architecture Guardrails

- **Primary target (Light architecture):** `<$10/month` (`min_instance_count = 0`, scale-to-zero) on Google Cloud (`asia-northeast1`).
  - Single-container **Cloud Run v2** running **Svelte 5 + SvelteKit 3** (`adapter-bun`, `shadcn-svelte` `sidebar-07` Home / `login-03` Login, `better-auth` Stateless Cookie + Google OAuth only, hardened **distroless** runtime image).
  - **Cloud Firestore (Standard Edition, Native Mode)** accessed server-side only via Cloud Run runtime service account.
  - **Tauri** desktop wrapper (`desktop/`) delegating Google OAuth to the OS browser + Deep Link callback.
- **No always-on fixed-cost resources:** Do NOT introduce Cloud SQL, Cloud Load Balancing, or non-zero `min_instance_count` into the Light architecture.
- **Standard architecture roadmap:** Multi-service variant (`web-app/api/` Rust Connect RPC + Axum + sqlx + RLS + PostgreSQL, AWS CDK, Azure Bicep, `bun run init` switcher) is tracked in [GitHub Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2).

---

## 2. Language & Documentation Policy

- **English is the canonical language** for all repository files:
  - `README.md`, `AGENTS.md`, `GEMINI.md`, `docs/adr/*`, `docs/architecture/README.md`, `.github/*`, subdirectory `README.md` files, `.drawio` labels, commit messages, and code comments.
- **Synchronized Japanese mirrors (`docs/jp/`):**
  Maintain Japanese translations under `docs/jp/` strictly for key human-facing documentation:
  - `README.md` <-> `docs/jp/README.md`
  - `docs/adr/NNNN-*.md` <-> `docs/jp/adr/NNNN-*.md`
  - `docs/architecture/README.md` <-> `docs/jp/architecture/README.md`
- **English-only files (not mirrored):** `AGENTS.md`, `GEMINI.md`, `.github/*`, `docs/adr/index.md`, `docs/adr/log.md`, `docs/adr/README.md`, and component subdirectory READMEs (`web-app/*/README.md`, `desktop/README.md`).
- **Sync rule:** Whenever a mirrored English document is created or edited, update its corresponding `docs/jp/` file in the **same commit** and keep top language-switcher links valid.

---

## 3. ADR Governance (OKF v0.3)

- `docs/adr/` is an **Open Knowledge Format (OKF) v0.3** knowledge bundle (`okf_version: "0.3"` declared in `docs/adr/index.md`).
- **Reserved & non-concept files:**
  - `docs/adr/index.md`: Bundle root listing ADRs and supporting files.
  - `docs/adr/log.md`: No frontmatter; newest-first `## YYYY-MM-DD` entries.
  - `docs/adr/README.md`: No `type:` frontmatter so OKF consumers skip it cleanly.
- **ADR concept files (`docs/adr/NNNN-<slug>.md`):**
  - Required/standard OKF v0.3 keys: `type: ADR`, `title`, `description`, `tags`, `status` (`draft | stable | deprecated`), `superseded_by` (when `deprecated`), `generated` (`{ by, at }`), `verified` (`[{ by, at }]`), `stale_after`, and `sources` referenced via `[^id]` footnotes.
  - ADR extension keys (`x-` prefix per OKF §4.1): `x-adr-id`, `x-adr-status` (`proposed | accepted | rejected | superseded`), `x-adr-deciders`.
  - **Trust tier rule:** Keep all timestamps in strict RFC 3339 with explicit timezone offset. When an agent updates substantive content, update `generated.at` (and do not forge `human:` entries in `verified` unless a human reviewed the edit).
  - Always update `docs/adr/index.md` and `docs/adr/log.md` when adding, updating, or superseding an ADR.

---

## 4. Tooling & Development Conventions

- **JavaScript / TypeScript:** Prefer `bun` and `bunx` (`adapter-bun` for SvelteKit).
- **Local development (Firestore):** Use root `compose.yaml` (`gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators`, `FIRESTORE_EMULATOR_HOST=localhost:8080`; on Windows run via `wslc compose up -d`).
- **Terraform (`web-app/infra/gcp/`):** Keep HCL formatted per `terraform fmt`, pass `terraform validate`, enforce Artifact Registry cleanup policies, and keep the two-step Secret Manager bootstrap (`enable_secret_env_refs = false` -> add versions -> `true`).
- **Rust (Tauri / future `web-app/api/`):** Follow `cargo`, `clippy`, and `rustfmt`.
- **UI Components & Svelte Skills:** Use `shadcn-svelte` blocks (`sidebar-07`, `login-03`), `mode-watcher` for Light/Dark/System themes, and follow the local agent skills placed under `web-app/app/.agents/skills/` (`shadcn-svelte`, `svelte-code-writer`, `svelte-core-bestpractices`).
- **SvelteKit Routing Policy (Light Architecture):** Prefer SvelteKit `load()` functions and form `actions` (`+page.server.ts` / `+layout.server.ts`) as the default for data loading and mutations. Do NOT add custom `+server.ts` API endpoints except for asynchronous/background jobs, health checks (`/api/health`), webhooks, or external/auth integrations (`/api/auth/*`).

---

## 5. Security & Public Template Rules

- **Zero real secrets in Git:** Never commit `.env*` (except `.env.example`), `*.tfvars` (except `terraform.tfvars.example`), `*.tfstate*`, `*.pem`, `*.key`, or GCP service account JSON files. Use dummy placeholders (`CHANGE_ME`, `your-gcp-project-id`) in `*.example` files.
- **Keyless CI/CD:** Authenticate GitHub Actions to Google Cloud via **Workload Identity Federation (OIDC)** only.
- **Production Auth Safety:** Keep `ENABLE_E2E_PASSWORD_AUTH="false"` in production Cloud Run (`web-app/infra/gcp/cloud_run.tf`), and default `AUTH_ACCESS_MODE="allowlist"`.
- **Public Issues-only workflow:** Keep `.github/workflows/secret-scan.yml` (Gitleaks) and `.github/workflows/terraform-validate.yml` green. External PRs are not accepted (`.github/CONTRIBUTING.md`).
