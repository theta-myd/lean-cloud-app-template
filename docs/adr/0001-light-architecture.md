---
type: ADR
title: "ADR-0001: Light Architecture Design (GCP / <$10/month / Scale-to-Zero)"
description: "Defines the <$10/month Light architecture on Google Cloud using Cloud Run v2 (min_instance_count=0), Svelte 5 + SvelteKit 3 (adapter-bun + distroless), Better Auth Stateless Cookie + Google OAuth, Cloud Firestore Standard, and Tauri."
tags:
  - architecture
  - gcp
  - cloud-run
  - firestore
  - sveltekit
  - better-auth
  - tauri
  - terraform
status: stable
x-adr-id: "ADR-0001"
x-adr-status: "accepted"
x-adr-deciders:
  - "human:theta"
generated:
  by: "antigravity/gemini-4"
  at: "2026-11-28T21:35:00+09:00"
verified:
  - by: "human:theta"
    at: "2026-11-27T13:15:00+09:00"
stale_after: "2027-05-27T00:00:00Z"
sources:
  - id: cloud-run-pricing
    resource: https://cloud.google.com/run/pricing
    title: "Google Cloud Run Pricing & Always Free Tier"
    author: "team:google-cloud-docs"
  - id: firestore-pricing
    resource: https://cloud.google.com/firestore/pricing
    title: "Cloud Firestore Pricing & Free Quota"
    author: "team:google-cloud-docs"
  - id: roadmap-standard-issue
    resource: https://github.com/theta-myd/agent-ready-app-template/issues/2
    title: "Roadmap: Add standard architecture variant (Rust API + PostgreSQL)"
    author: "human:theta"
  - id: okf-spec-v03
    resource: https://github.com/open-knowledge-format/open-knowledge-format
    title: "Open Knowledge Format (OKF) v0.3 Specification"
    author: "team:open-knowledge-format"
---

> Language: **English** | [日本語](../jp/adr/0001-light-architecture.md)

# ADR-0001: Light Architecture Design (GCP / <$10/month / Scale-to-Zero)

- **Diagram:** [gcp/light-architecture.drawio.svg](../architecture/gcp/light-architecture.drawio.svg) (editable source: [gcp/light-architecture.drawio](../architecture/gcp/light-architecture.drawio))
- **Implementation:** [web-app/infra/gcp/](../../web-app/infra/gcp/) | [compose.yaml](../../compose.yaml) | [web-app/app/.env.example](../../web-app/app/.env.example)

---

## 1. Context and Constraints

We need an initial architecture (**Light** variant) for a small-scale / indie web and desktop application template that satisfies the following constraints:

1. **Cost ceiling:** Keep monthly Google Cloud spend **under $10/month** at low/normal traffic (near **$0/month** when idle).
2. **Strict scale-to-zero:** Eliminate always-on fixed-cost services (such as Cloud SQL and Cloud Load Balancing) and run with `min_instance_count = 0`.
3. **Monorepo maintainability:** Start with a single-container setup while keeping the repository structure ready for a future **Standard** multi-service upgrade (Rust API + PostgreSQL + RLS).[^roadmap-standard-issue]
4. **Public template safety:** Never store real secrets or JSON service account keys in Git or CI/CD.

---

## 2. Decisions

| Layer | Technology / Service | Rationale |
| :--- | :--- | :--- |
| **Compute** | **Cloud Run v2** (single container, `asia-northeast1` Tier 1, `min_instance_count = 0`, 1 vCPU / 512 MiB, request-based billing) | Scales to zero with a generous Always Free tier (2M requests, 180k vCPU-sec, 360k GiB-sec/month).[^cloud-run-pricing] |
| **Web App / BFF** | **Svelte 5 + SvelteKit 3** (`adapter-bun`) + **distroless** | Serves SSR, BFF, and auth from one container; non-root distroless minimizes image size and attack surface. |
| **UI** | **shadcn-svelte** (Home: `sidebar-07` / Login: `login-03`) | Standard block-based collapsible icon sidebar dashboard and login screen. |
| **Authentication** | **Better Auth (Stateless Cookie mode)** + **Google OAuth 2.0 only** (`openid`, `email`, `profile`) | Better Auth (MIT OSS) and basic Google OAuth scopes are both free. Encrypted HttpOnly stateless cookies require zero DB reads per session check. |
| **Desktop** | **Tauri** (`web-app/app` wrapper) | Google blocks OAuth inside embedded WebViews (`disallowed_useragent`), so desktop sign-in delegates to the OS default browser and returns via a custom URL scheme (Deep Link). |
| **Datastore** | **Cloud Firestore (Standard Edition, Native Mode)** (`asia-northeast1`) | Covered by the Always Free daily tier (1 GiB, 50k reads, 20k writes, 20k deletes/day). Accessed server-side only via the Cloud Run runtime service account (ADC).[^firestore-pricing] |
| **Ingress** | **Cloud Run default HTTPS URL (`*.run.app`)** | Cloud Load Balancing adds ~$18+/month in fixed hourly charges and exceeds the budget. Custom domains/CDN can optionally use **Firebase Hosting** (with a free tier) later. |
| **Registry** | **Artifact Registry** + Cleanup Policy | Stores distroless images with automated cleanup keeping only the latest 2–3 versions inside the 0.5 GiB Always Free tier. |
| **Secrets** | **Secret Manager** | Stores `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` (Always Free: 6 active versions, 10k accesses/month). |
| **CI/CD** | **GitHub Actions + Workload Identity Federation (OIDC)** | Keyless deployment via short-lived OIDC tokens. |
| **Observability & Guardrails** | **Cloud Logging / Monitoring** + **Cloud Billing Budget** | Uses the 50 GiB/month free logging tier plus staged budget alerts at `$5` / `$8` / `$10`. |

---

## 3. Monthly Cost Estimate and Overrun Risks

### Estimated Monthly Cost

| Service | Always Free Tier Summary | Idle | Light Traffic |
| :--- | :--- | :--- | :--- |
| Cloud Run v2 | 2M req / 180k vCPU-sec / 360k GiB-sec (per billing account)[^cloud-run-pricing] | $0 | $0–$2 |
| Cloud Firestore (Standard) | 1 GiB / 50k R / 20k W / 20k D per day (1 DB/project)[^firestore-pricing] | $0 | $0–$2 |
| Artifact Registry | 0.5 GiB (per billing account) | $0 | $0 (with Cleanup Policy) |
| Secret Manager | 6 active versions / 10k accesses | $0 | $0 |
| Cloud Logging | 50 GiB / month | $0 | $0 |
| **Total** | — | **$0 / mo** | **$0–$5 / mo** |

### Key Overrun Risks & Mitigations
- **Artifact Registry growth:** Unbounded images exceed 0.5 GiB. Terraform enforces cleanup policies (delete untagged >7d, tagged >30d, keep recent 3 versions).
- **Cloud Run egress / heavy static assets:** Offload heavy static assets to Firebase Hosting (CDN) or Cloud Storage if egress grows.
- **Unbounded Firestore queries:** Because session checks use stateless cookies, read volume stays low; enforce `limit` pagination on all list queries.

---

## 4. Security Design and Trade-offs

1. **Better Auth Stateless Cookie Trade-off**
   - **Pros:** Zero Firestore reads and low latency on session validation.
   - **Constraint:** Without a session table in a DB, individual device sessions cannot be immediately revoked server-side.
   - **Mitigation:** Keep cookie TTL reasonable (e.g., 7 days) and store `BETTER_AUTH_SECRET` in Secret Manager (secret rotation invalidates all sessions). Move to DB-backed sessions if immediate per-device revocation or email/password production auth is needed later.
2. **Firestore Access Boundary**
   - Firestore Security Rules deny all direct client access; only the SvelteKit BFF (`server.ts`) accesses Firestore using the least-privilege Cloud Run runtime SA.
3. **Least-Privilege IAM Separation**
   - **GitHub Actions Deployer SA (WIF/OIDC):** Restricted to Artifact Registry writer (scoped to the repo), Cloud Run developer, and `iam.serviceAccountUser` on the runtime SA.
   - **Cloud Run Runtime SA:** Restricted to `roles/datastore.user` and `roles/secretmanager.secretAccessor` on the specific app secrets.

---

## 5. Access Control, E2E Test Auth, and Local Development

### 5.1 Restricted User Access (Allowlist Authorization)
To support private/invite-only apps while keeping Google OAuth 2.0 as the sole login provider, environment-based allowlist authorization is built in:

- **Environment variables:**
  - `AUTH_ACCESS_MODE`: `open` (any Google account) or `allowlist` (restricted to matching emails/domains; template default)
  - `ALLOWED_EMAILS`: Comma-separated allowed email addresses
  - `ALLOWED_DOMAINS`: Comma-separated allowed email domains (e.g., Google Workspace domains)
- **Implementation:**
  - Validate `email` and `emailVerified === true` in both the Better Auth OAuth callback hook and SvelteKit `hooks.server.ts`.
  - Storing the allowlist in environment variables keeps **Firestore reads at 0**. Apps requiring dynamic in-app user management can swap this check to an `allowed_users` Firestore collection later.
  - For personal/small-group apps, setting the Google OAuth consent screen to **Testing** (up to 100 test users) or **Internal** (Google Workspace) adds a first line of defense.

### 5.2 E2E Test Email / Password Login (Env-Gated)
Because automating production Google OAuth in Playwright E2E tests is brittle, an opt-in E2E login path is provided:

- **Environment variables:**
  - `ENABLE_E2E_PASSWORD_AUTH=false` (MUST remain `"false"` in production Cloud Run)
  - `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` (set only during local/CI E2E runs)
- **Design:**
  - **UI (`login-03`):** Render the email/password form only when `ENABLE_E2E_PASSWORD_AUTH=true`; otherwise render only the Google Sign-In button.
  - **Backend (Better Auth):** Production (`false`) runs in pure Stateless Cookie mode. When `true`, initialize Better Auth with Bun's built-in in-memory SQLite (`bun:sqlite` `:memory:`) and seed one test user on startup, enabling real `signIn.email` session cookie issuance without extra dependencies or a persistent DB.

### 5.3 Local Development (Firestore Emulator)
Local development uses the official Google Cloud Firestore Emulator container with zero GCP cost or network dependency:

- **Root `compose.yaml` / container command:** Runs `gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators` executing `gcloud emulators firestore start --host-port=0.0.0.0:8080` via `docker compose up -d` (or `wslc run -d --rm --name firestore-emulator -p 8080:8080 gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators gcloud emulators firestore start --host-port=0.0.0.0:8080` on Windows, as `wslc` has no `compose` subcommand).
- **SDK integration:** Setting `FIRESTORE_EMULATOR_HOST=localhost:8080` makes `@google-cloud/firestore` automatically route traffic to the local emulator with zero application code branching.

---

## 6. Terraform Implementation (`web-app/infra/gcp/`)

Implemented under [web-app/infra/gcp/](../../web-app/infra/gcp/) in alignment with OKF v0.3 operational governance:[^okf-spec-v03]

- `versions.tf` / `providers.tf` — Terraform and `hashicorp/google` provider config (with GCS remote state guide)
- `variables.tf` / `terraform.tfvars.example` — `project_id`, `region` (`asia-northeast1`), `service_name`, `budget_amount_usd` (`10`), `github_repository`, `auth_access_mode`, etc.
- `apis.tf` — Enables `run`, `firestore`, `artifactregistry`, `secretmanager`, `iam`, `iamcredentials`, `cloudresourcemanager` (and optional `billingbudgets`)
- `iam.tf` — Cloud Run runtime SA and optional GitHub Actions WIF Pool / Provider + Deployer SA
- `artifact_registry.tf` — Docker repository with cleanup policies (delete untagged >7d, tagged >30d, keep recent `artifact_keep_count` versions)
- `secrets.tf` — Secret Manager secret containers (two-step bootstrap; values populated out-of-band)
- `firestore.tf` — Firestore Standard (`FIRESTORE_NATIVE`) database
- `cloud_run.tf` — Cloud Run v2 service (`min_instance_count = 0`, 1 vCPU / 512 MiB, `ENABLE_E2E_PASSWORD_AUTH = "false"`)
- `budget.tf` — Optional Cloud Billing Budget (50% / 80% / 100% alert thresholds)
- `outputs.tf` — Cloud Run URL, WIF Provider name, Artifact Registry URL, etc.

[^cloud-run-pricing]: Google Cloud Run Pricing & Always Free Tier
[^firestore-pricing]: Cloud Firestore Pricing & Free Quota
[^roadmap-standard-issue]: Roadmap: Add standard architecture variant (Rust API + PostgreSQL)
[^okf-spec-v03]: Open Knowledge Format (OKF) v0.3 Specification
