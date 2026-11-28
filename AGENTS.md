# Repository Rules & Agent Guidelines

This file defines shared rules for all AI coding agents and contributors working in **lean-cloud-app-template**.

---

## 1. Project Scope & Architecture Guardrails

- **Primary target (Light architecture):** `<$10/month` (`min_instance_count = 0`, scale-to-zero) on Google Cloud (`asia-northeast1`).
  - Single-container **Cloud Run v2** running **Svelte 5 + SvelteKit 3** (`adapter-bun`, `shadcn-svelte` `sidebar-07` Home / `login-03` Login, `better-auth` Stateless Cookie + Google OAuth only, hardened **distroless** runtime image).
  - **Cloud Firestore (Standard Edition, Native Mode)** accessed server-side only via Cloud Run runtime service account.
  - **Tauri** desktop wrapper (`desktop/`) delegating Google OAuth to the OS browser + Deep Link callback.
- **No always-on fixed-cost resources:** Do NOT introduce Cloud SQL, Cloud Load Balancing, or non-zero `min_instance_count` into the Light architecture.
- **Standard architecture (GCP):** Multi-service variant (`web-app/api/` Rust Connect RPC + Axum + `sqlx` + PostgreSQL 18 RLS, Private-IP Cloud SQL + Direct VPC Egress + Private Cloud DNS, `web-app/infra/gcp/standard/`, `bun run init` switcher) is implemented and live-verified.
- **Multi-cloud roadmap:** AWS CDK support is tracked in [#54](https://github.com/theta-myd/lean-cloud-app-template/issues/54), and Azure Bicep support is tracked in [#55](https://github.com/theta-myd/lean-cloud-app-template/issues/55).

---

## 2. Language & Documentation Policy

- **English is the canonical language** for all repository files:
  - `README.md`, `AGENTS.md`, `GEMINI.md`, `docs/adr/*`, `docs/architecture/README.md`, `.github/*`, subdirectory `README.md` files, `.drawio` labels, commit messages, and code comments.
- **Synchronized Japanese mirrors (`docs/jp/`):**
  Maintain Japanese translations under `docs/jp/` strictly for key human-facing documentation:
  - `README.md` <-> `docs/jp/README.md`
  - `docs/adr/NNNN-*.md` <-> `docs/jp/adr/NNNN-*.md`
  - `docs/architecture/README.md` <-> `docs/jp/architecture/README.md`
- **English-only files (not mirrored):** `AGENTS.md`, `GEMINI.md`, `CHANGELOG.md`, `.github/*`, `docs/adr/index.md`, `docs/adr/log.md`, `docs/adr/README.md`, and component subdirectory READMEs (`web-app/*/README.md`, `desktop/README.md`).
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
- **Local development (Firestore):** Use `docker compose up -d` with root `compose.yaml` (`gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators`, `FIRESTORE_EMULATOR_HOST=localhost:8080`). On Windows with `wslc` (which has no `compose` subcommand), run `wslc run -d --rm --name firestore-emulator -p 8080:8080 gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators gcloud emulators firestore start --host-port=0.0.0.0:8080`.
- **Terraform (`web-app/infra/gcp/light/`, `web-app/infra/gcp/standard/`):** Keep HCL formatted per `terraform fmt`, pass `terraform validate`, enforce Artifact Registry cleanup policies, and keep the two-step Secret Manager bootstrap (`enable_secret_env_refs = false` -> add versions -> `true`).
- **Rust (Tauri / future `web-app/api/`):** Follow `cargo`, `clippy`, and `rustfmt`.
- **UI Components & Svelte Skills:** Use `shadcn-svelte` blocks (`sidebar-07`, `login-03`), `mode-watcher` for Light/Dark/System themes, and follow the local agent skills placed under `web-app/app/.agents/skills/` (`shadcn-svelte`, `svelte-code-writer`, `svelte-core-bestpractices`).
- **SvelteKit Routing Policy (Light Architecture):** Prefer SvelteKit `load()` functions and form `actions` (`+page.server.ts` / `+layout.server.ts`) as the default for data loading and mutations. Do NOT add custom `+server.ts` API endpoints except for asynchronous/background jobs, health checks (`/api/health`), webhooks, or external/auth integrations (`/api/auth/*`).

---

## 5. Security & Public Template Rules

- **Zero real secrets in Git:** Never commit `.env*` (except `.env.example`), `*.tfvars` (except `terraform.tfvars.example`), `*.tfstate*`, `*.pem`, `*.key`, or GCP service account JSON files. Use dummy placeholders (`CHANGE_ME`, `your-gcp-project-id`) in `*.example` files.
- **Keyless CI/CD:** Authenticate GitHub Actions to Google Cloud via **Workload Identity Federation (OIDC)** only.
- **Production Auth Safety:** Keep `ENABLE_E2E_PASSWORD_AUTH="false"` in production Cloud Run (`web-app/infra/gcp/light/cloud_run.tf`, `web-app/infra/gcp/standard/cloud_run.tf`), and default `AUTH_ACCESS_MODE="allowlist"`.
- **Public Issues-only workflow:** Keep `.github/workflows/secret-scan.yml` (Gitleaks) and `.github/workflows/terraform-validate.yml` green. External PRs are not accepted (`.github/CONTRIBUTING.md`).

---

## 6. Task Workflow (Issue -> Worktree -> Draft PR -> Merge)

- **One task per GitHub Issue:** Create a dedicated GitHub Issue before starting implementation, listing explicit **Owned Paths** so parallel work stays conflict-free.
- **Claim before starting:** Assign the Issue and add the `in-progress` label before branching (`gh issue edit <N> --add-label in-progress --add-assignee @me`).
- **Workspace Git worktree:** Create the task branch (`<type>/issue-<N>-<slug>`) under the gitignored root `.worktrees/issue-<N>` directory (outside `.agents/` so bundled skills are not double-discovered, while keeping worktree files inside the Antigravity Project workspace boundary). Multiple Issues whose Owned Paths do not overlap may run in parallel.
- **Draft PR while working:** Always open in-progress Pull Requests as **Draft** (`gh pr create --draft`) to prevent accidental merges before work and CI checks are complete. Include `Closes #<N>` (and `Generated with Gemini (Antigravity)` per `GEMINI.md` when co-developed).
- **Ready, Merge, and Cleanup:** Once implementation is finished and all CI checks pass, mark the PR ready (`gh pr ready`). After review, squash-merge into `main`, delete the branch, remove the worktree (`git worktree remove`), and clear `in-progress` if still attached.

---

## 7. Release Policy

- **Versioning (SemVer `vMAJOR.MINOR.PATCH`):**
  - During `v0.x.y`, bump **MINOR** for new cloud providers, major architecture additions, or breaking template changes (e.g., `v0.1.0` GCP Light & Standard -> `v0.2.0` AWS -> `v0.3.0` Azure), and bump **PATCH** for bug fixes, security/dependency updates, and documentation improvements.
  - Promote to `v1.0.0` once the core template and target cloud variants are stable.
- **Lockstep Manifest Versions:** Before tagging `vX.Y.Z`, align `version` to `X.Y.Z` across all six repository manifests:
  - `package.json`
  - `web-app/app/package.json`
  - `web-app/api/Cargo.toml`
  - `desktop/package.json`
  - `desktop/src-tauri/Cargo.toml`
  - `desktop/src-tauri/tauri.conf.json`
- **Changelog & Release Notes:**
  - Maintain `CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format (English-only).
  - Keep `.github/release.yml` configured so GitHub Release Notes categorize PRs cleanly.
- **Release Procedure:**
  1. Open a dedicated release-preparation Issue & Draft PR to synchronize manifest versions and update `CHANGELOG.md`.
  2. Verify all required CI checks (`Web App CI`, `Rust API CI`, `Terraform Validate`, `Secret Scan`) and `bun run test:init` pass on `main` after merging.
  3. Create and push an **annotated tag** on the merged `main` commit (`git tag -a vX.Y.Z -m "Release vX.Y.Z" && git push origin vX.Y.Z`).
  4. Publish the GitHub Release (`gh release create vX.Y.Z`) summarizing the `CHANGELOG.md` entry.
