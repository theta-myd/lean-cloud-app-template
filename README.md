> Language: **English** | [日本語](./docs/jp/README.md)

# lean-cloud-app-template

A **<$10/month**, **scale-to-zero (`min-instance = 0`)** Cloud Run web & desktop application template built around **Svelte 5 + SvelteKit 3** and **Tauri**.

> **Status:** Light architecture design, OKF v0.3 ADR, GCP Terraform IaC (`web-app/infra/gcp/`), and `web-app/app/` (`Svelte 5 + SvelteKit 3 + shadcn-svelte + mode-watcher + better-auth`) are ready. Next up: CI/CD & E2E ([Issue #4](https://github.com/theta-myd/lean-cloud-app-template/issues/4), [#5](https://github.com/theta-myd/lean-cloud-app-template/issues/5)), Firestore CRUD sample ([#6](https://github.com/theta-myd/lean-cloud-app-template/issues/6)), and `desktop/` Tauri wrapper ([#7](https://github.com/theta-myd/lean-cloud-app-template/issues/7)).

---

## Concept & Cost Target

- **Target monthly cost:** **<$10/month** (typically **$0–$5/month**, idle **$0/month**)
- **Scale-to-zero first:** Cloud Run services run with `min_instance_count = 0` and avoid always-on fixed-cost services (no Cloud SQL, no Cloud Load Balancing)
- **Single-source template:** Start lean with the **Light** single-container setup, while keeping the structure ready for a future **Standard** multi-service upgrade

---

## Architecture Variants

### 1. Light Architecture (Current Focus)

![Light Architecture](./docs/architecture/light-architecture.drawio.svg)

- **Compute (`web-app/app`):** Cloud Run v2 single container (`asia-northeast1`, `min_instance_count = 0`, 1 vCPU / 512 MiB, `*.run.app`) running Svelte 5 + SvelteKit 3 (`adapter-bun`) on a hardened **distroless** image
- **UI:** `shadcn-svelte` (Home: `sidebar-07`, Login: `login-03`) with `mode-watcher` (`light` / `dark` / `system`) + bundled `shadcn-svelte` and official Svelte skills under `web-app/app/.agents/skills/`
- **Authentication:** `better-auth` in **Stateless Cookie** mode + **Google OAuth 2.0 only** (`openid`, `email`, `profile`, `$0`), with optional env-based user/domain allowlist and an E2E-only password login toggle (`ENABLE_E2E_PASSWORD_AUTH=false` in production)
- **Datastore:** **Cloud Firestore (Standard Edition, Native Mode)** within the Always Free daily tier, accessed server-side only via the Cloud Run runtime service account (local dev uses the official Firestore Emulator via `compose.yaml`)
- **Desktop (`desktop`):** Tauri wrapper around `web-app/app` (delegates Google OAuth to the OS browser and returns via Deep Link)
- **Infra & Guardrails (`web-app/infra/gcp`):** Terraform for Cloud Run v2, Firestore, Artifact Registry (cleanup policy), Secret Manager, Workload Identity Federation (OIDC), Cloud Logging, and Cloud Billing Budget alerts (`$5` / `$8` / `$10`)
- **Design Docs:** [light-architecture.drawio](./docs/architecture/light-architecture.drawio) | [ADRs (OKF v0.3)](./docs/adr/index.md) | [ADR-0001](./docs/adr/0001-light-architecture.md)

### 2. Standard Architecture (Planned Roadmap)

Tracked in [Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2) for workloads requiring a dedicated backend API and relational database with Row-Level Security (RLS):

- **Backend API (`web-app/api`):** Rust (`Connect RPC + Axum + sqlx + RLS`)
- **Database:** PostgreSQL (note: Cloud SQL has no native scale-to-zero and typically costs ~$10–$15+/month minimum, which is why **Light** is prioritized first)
- **Multi-cloud & Init Switcher:** Future `web-app/infra/aws` (AWS CDK), `web-app/infra/azure` (Bicep), and `bun run init` switcher between `light` and `standard`

---

## Directory Structure

```text
lean-cloud-app-template/
├── .github/
│   ├── ISSUE_TEMPLATE/        # Bug & feature request forms (Issues-only workflow)
│   ├── workflows/             # CI secret scanning (Gitleaks) & Terraform validate
│   ├── CONTRIBUTING.md
│   └── dependabot.yml
├── docs/
│   ├── adr/                   # OKF v0.3 Architecture Decision Records (English canonical)
│   ├── architecture/          # .drawio / .drawio.svg architecture diagrams
│   └── jp/                    # Synchronized Japanese documentation mirrors
├── web-app/
│   ├── app/                   # Svelte 5 + SvelteKit 3 (adapter-bun) + shadcn-svelte + better-auth
│   └── infra/
│       ├── gcp/               # Terraform (primary target)
│       ├── aws/               # Placeholder for future AWS CDK
│       └── azure/             # Placeholder for future Azure Bicep
├── desktop/                   # Tauri desktop wrapper
├── AGENTS.md                  # Shared repository rules for AI agents
├── GEMINI.md                  # Antigravity / Gemini workspace rules (includes AGENTS.md)
├── compose.yaml               # Local Firestore Emulator container
├── .gitleaks.toml
├── .gitignore
├── LICENSE                    # MIT License
└── README.md
```

---

## Documentation Language Policy

- **English** is the canonical language for all documentation, ADRs, diagrams, and agent rules.
- Synchronized **Japanese mirrors** for key human-facing docs live under [`docs/jp/`](./docs/jp/README.md). See [AGENTS.md](./AGENTS.md) for contributor and agent rules.

---

## Security & Secret Handling

This is a **public template repository**. Never commit real credentials or environment-specific state:

- Only commit `*.example` files (`.env.example`, `terraform.tfvars.example`) with dummy placeholder values (`CHANGE_ME`).
- Real `.env*`, `*.tfvars`, `*.tfstate*`, `*.pem`, `*.key`, and service account JSON files are blocked via `.gitignore`.
- CI authentication to Google Cloud uses **Workload Identity Federation (OIDC)** instead of long-lived JSON service account keys.
- All commits to `main` are scanned with **Gitleaks** (`.github/workflows/secret-scan.yml`).

---

## Issues & License

- **Feedback / Questions:** Please open an Issue using the provided templates (pull requests from external forks are not accepted; see [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)).
- **License:** [MIT](LICENSE)
