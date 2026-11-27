# lean-cloud-app-template

A **<$10/month**, **scale-to-zero (`min-instance = 0`)** Cloud Run web & desktop application template built around **Svelte 5 + SvelteKit 3** and **Tauri**.

> **Status:** Initial repository scaffolding. Architecture design (`.drawio`), application code, and Terraform IaC are being developed iteratively with a focus on the **Light** architecture first.

---

## Concept & Cost Target

- **Target monthly cost:** **<$10/month** at low/idle traffic
- **Scale-to-zero first:** Cloud Run services run with `min-instance = 0`
- **Single-source template:** Start lean with the **Light** single-container setup, while keeping the structure ready for a future **Standard** multi-service upgrade

---

## Architecture Variants

### 1. Light Architecture (Current Focus)

Optimized to keep infrastructure costs near zero while preserving a clean SvelteKit + BFF + Desktop workflow:

- **Web App (`web-app/app`):** Svelte 5 + SvelteKit 3 (`adapter-bun`), `shadcn-svelte` (with `shadcn-svelte` agent skill), `better-auth`, packaged into a hardened **distroless** container
- **Datastore:** Low-cost / scale-to-zero datastore (design in progress under `docs/architecture/`)
- **Authentication:** `better-auth` + Google OAuth (with system-browser + Deep Link flow planned for Desktop)
- **Desktop (`desktop`):** Tauri wrapper around the web app
- **Infra (`web-app/infra/gcp`):** Terraform for Google Cloud (Cloud Run `min-instance = 0`, Artifact Registry, Secret Manager, Workload Identity Federation)

### 2. Standard Architecture (Planned Roadmap)

For workloads requiring a dedicated backend API and relational database with Row-Level Security (RLS):

- **Backend API (`web-app/api`):** Rust (`Connect RPC + Axum + sqlx + RLS`)
- **Database:** PostgreSQL (note: Cloud SQL has no native scale-to-zero and typically costs ~$10–$15+/month minimum, which is why **Light** is prioritized first)
- **Multi-cloud & Init Switcher:** Future `web-app/infra/aws` (AWS CDK), `web-app/infra/azure` (Bicep), and `bun run init` switcher between `light` and `standard`

---

## Directory Structure

```text
lean-cloud-app-template/
├── .github/
│   ├── ISSUE_TEMPLATE/        # Bug & feature request forms (Issues-only workflow)
│   ├── workflows/             # CI secret scanning (Gitleaks)
│   ├── CONTRIBUTING.md
│   └── dependabot.yml
├── docs/
│   └── architecture/          # .drawio architecture diagrams & ADRs
├── web-app/
│   ├── app/                   # Svelte 5 + SvelteKit 3 (adapter-bun) + shadcn-svelte + better-auth
│   └── infra/
│       ├── gcp/               # Terraform (primary target)
│       ├── aws/               # Placeholder for future AWS CDK
│       └── azure/             # Placeholder for future Azure Bicep
├── desktop/                   # Tauri desktop wrapper
├── .gitleaks.toml
├── .gitignore
├── LICENSE                    # MIT License
└── README.md
```

---

## Security & Secret Handling

This is a **public template repository**. Never commit real credentials or environment-specific state:

- Only commit `*.example` files (`.env.example`, `terraform.tfvars.example`) with dummy placeholder values (`CHANGE_ME`).
- Real `.env*`, `*.tfvars`, `*.tfstate*`, `*.pem`, `*.key`, and service account JSON files are blocked via `.gitignore`.
- CI authentication to Google Cloud should use **Workload Identity Federation (OIDC)** instead of long-lived JSON service account keys.
- All commits to `main` are scanned with **Gitleaks** (`.github/workflows/secret-scan.yml`).

---

## Issues & License

- **Feedback / Questions:** Please open an Issue using the provided templates (pull requests from external forks are not accepted; see [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)).
- **License:** [MIT](LICENSE)
