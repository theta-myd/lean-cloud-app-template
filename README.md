> Language: **English** | [日本語](./docs/jp/README.md)

# lean-cloud-app-template

A **<$10/month**, **scale-to-zero (`min-instance = 0`)** Cloud Run web & desktop application template built around **Svelte 5 + SvelteKit 3** and **Tauri**, with an optional **Standard** multi-service upgrade (**Rust Connect RPC + PostgreSQL 18 RLS**).

> **Status:** Both **Light** (Cloud Run v2 + Cloud Firestore) and **Standard** (Cloud Run v2 BFF + internal Rust Connect RPC API + Cloud SQL PostgreSQL 18 + Direct VPC Egress + Private Cloud DNS + RLS) architectures are implemented and verified end-to-end on Google Cloud, along with `bun run init` to specialize a new repository into either variant. See [CHANGELOG.md](./CHANGELOG.md).

---

## Concept & Cost Target

- **Target monthly cost (Light):** **<$10/month** (typically **$0–$5/month**, idle **$0/month**)
- **Scale-to-zero first:** Cloud Run services run with `min_instance_count = 0` and avoid always-on fixed-cost services in the Light variant (no Cloud SQL, no Cloud Load Balancing)
- **Single-source template with clean pruning (`bun run init`):** Keep both Light and Standard in one repository, with `web-app/app/src/lib/server/` cleanly split into core, `light/`, and `standard/` so `bun run init` strips unused variant code and dependencies cleanly

---

## Quick Start: Initialize Your Variant (`bun run init`)

After creating a repository from this template, run `bun run init` from the repository root to lock the project to **Light** or **Standard**:

```bash
# Interactive mode (prompts for variant, optional app slug, and options)
bun run init

# Preview changes without modifying files
bun run init -- --variant=standard --name=my-saas-app --dry-run

# Initialize as Standard (removes Light Firestore BFF code & promotes web-app/infra/gcp/standard/)
bun run init -- --variant=standard --name=my-saas-app --yes

# Initialize as Light (removes Standard BFF code, pg/ConnectRPC deps, web-app/api/, proto/)
bun run init -- --variant=light --name=my-lean-app --yes

# Initialize as Light while keeping web-app/api/ & proto/ as reference examples
bun run init -- --variant=light --keep-api --yes
```

What `bun run init` does for each variant:

| Area | `--variant=light` (GCP) | `--variant=standard` (GCP) |
| --- | --- | --- |
| **BFF (`web-app/app/src/lib/server/`)** | Keeps `light/gcp/firestore.ts`; removes `standard/` & `src/lib/gen/`; locks `backend.ts` to Light | Keeps `standard/` (Better Auth `auth` schema pool + Connect RPC client); removes `light/` (zero direct datastore CRUD from BFF); locks `backend.ts` to Standard |
| **Dependencies (`web-app/app/package.json`)** | Removes `pg`, `@types/pg`, `@connectrpc/*`, `@bufbuild/*` | Removes `@google-cloud/firestore` |
| **Rust API & Proto** | Removes `web-app/api/`, `proto/`, `buf*.yaml`, `rust-api-ci.yml` (retained if `--keep-api`) | Kept |
| **Local Compose (`compose.yaml`)** | Firestore Emulator only | PostgreSQL 18 default (`docker compose up -d`) |
| **Terraform (`web-app/infra/gcp/`)** | Promotes `light/` → `web-app/infra/gcp/` | Promotes `standard/` → `web-app/infra/gcp/` |
| **CI/CD (`.github/workflows/`)** | Removes `deploy-gcp-standard.yml`; simplifies `terraform-validate.yml` | Removes `deploy-gcp.yml`; simplifies `terraform-validate.yml` |
| **Rename (`--name=<slug>`)** | Updates package names, Tauri `productName` / `identifier` / deep-link scheme, Terraform `service_name`, and deploy workflow defaults | Same + `web-app/api/Cargo.toml` crate name |

> **Cloud extensibility:** In Standard mode, `web-app -> BFF -> Rust API -> PostgreSQL` is identical across GCP, AWS, and Azure (only the internal service-to-service IAM helper such as `standard/gcp-id-token.ts` differs). In Light mode, datastore & auth session choices vary by cloud (`light/gcp/firestore.ts` uses Stateless JWE Cookies + Firestore; future `light/aws/` can plug in PostgreSQL DB sessions + Aurora DSQL behind the same `BackendAdapter` interface).

---

## Architecture Variants

### 1. Light Architecture (Primary Default)

![Light Architecture](./docs/architecture/gcp/light-architecture.drawio.svg)

- **Compute (`web-app/app`):** Cloud Run v2 single container (`asia-northeast1`, `min_instance_count = 0`, 1 vCPU / 512 MiB, `*.run.app`) running Svelte 5 + SvelteKit 3 (`adapter-bun`) on a hardened **distroless** image
- **UI:** `shadcn-svelte` (Home: `sidebar-07`, Login: `login-03`) with `mode-watcher` (`light` / `dark` / `system`) + bundled `shadcn-svelte` and official Svelte skills under `web-app/app/.agents/skills/`
- **Authentication:** `better-auth` in **Stateless Cookie** mode + **Google OAuth 2.0 only** (`openid`, `email`, `profile`, `$0`), with optional env-based user/domain allowlist and an E2E-only password login toggle (`ENABLE_E2E_PASSWORD_AUTH=false` in production)
- **Datastore:** **Cloud Firestore (Standard Edition, Native Mode)** within the Always Free daily tier, accessed server-side only via the Cloud Run runtime service account (local dev uses the official Firestore Emulator via `compose.yaml`)
- **Desktop (`desktop`):** Tauri wrapper around `web-app/app` (delegates Google OAuth to the OS browser and returns via Deep Link)
- **Infra & Guardrails (`web-app/infra/gcp/light`):** Terraform for Cloud Run v2, Firestore, Artifact Registry (cleanup policy), Secret Manager, Workload Identity Federation (OIDC), Cloud Logging, and Cloud Billing Budget alerts (`$5` / `$8` / `$10`)
- **Design Docs:** [gcp/light-architecture.drawio](./docs/architecture/gcp/light-architecture.drawio) | [Architecture Diagrams](./docs/architecture/README.md) | [ADRs (OKF v0.3)](./docs/adr/index.md) | [ADR-0001](./docs/adr/0001-light-architecture.md)

### 2. Standard Architecture

![Standard Architecture](./docs/architecture/gcp/standard-architecture.drawio.svg)

For workloads requiring a dedicated backend API and relational database with Row-Level Security (RLS):

- **BFF (`web-app/app`):** Svelte 5 + SvelteKit 3 with Better Auth DB sessions in PostgreSQL (`auth` schema) and Connect RPC client (`src/lib/server/standard/`) forwarding short-lived HS256 `x-app-user-token` + GCP OIDC ID tokens to the internal API
- **Backend API (`web-app/api`):** Rust (`Connect RPC + Axum + sqlx + PostgreSQL 18 RLS`) on internal-only Cloud Run v2 (`INGRESS_TRAFFIC_INTERNAL_ONLY` + Cloud Run IAM) + `--migrate-only` Cloud Run Job
- **Database:** Cloud SQL for PostgreSQL 18 (Private IP only + Direct VPC Egress `$0`; note: Cloud SQL has no native scale-to-zero and typically costs `~$10–$15+/month` minimum, which is why **Light** is prioritized for `<$10/month`)
- **Infra (`web-app/infra/gcp/standard`):** Terraform for Custom VPC + Private Services Access + Private Cloud DNS (`run.app.` -> `private.googleapis.com`), Cloud SQL for PostgreSQL 18 (Private IP only), Cloud Run v2 (`app`, internal `api`, and `migrate` Job via Direct VPC Egress), least-privilege SAs, Secret Manager, WIF (OIDC), and Cloud Billing Budget alerts (`$10` / `$15` / `$20`)
- **Design Docs:** [gcp/standard-architecture.drawio](./docs/architecture/gcp/standard-architecture.drawio) | [Architecture Diagrams](./docs/architecture/README.md) | [ADR-0002](./docs/adr/0002-standard-architecture.md)
- **Multi-cloud roadmap:** Future `web-app/infra/aws` (AWS CDK, [#54](https://github.com/theta-myd/lean-cloud-app-template/issues/54)) and `web-app/infra/azure` (Azure Bicep, [#55](https://github.com/theta-myd/lean-cloud-app-template/issues/55))

---

## Directory Structure

```text
lean-cloud-app-template/
├── .github/
│   ├── ISSUE_TEMPLATE/        # Bug & feature request forms (Issues-only workflow)
│   ├── workflows/             # CI (Web App, Rust API, Terraform Validate, Gitleaks) & GCP Deploy
│   ├── CONTRIBUTING.md
│   └── dependabot.yml
├── compose/
│   └── postgres/              # Local PostgreSQL 18 init script (auth/app schemas & RLS roles)
├── docs/
│   ├── adr/                   # OKF v0.3 Architecture Decision Records (English canonical)
│   ├── architecture/          # .drawio / .drawio.svg architecture diagrams
│   └── jp/                    # Synchronized Japanese documentation mirrors
├── proto/                     # Buf v2 Protobuf definitions (TenantService, TodoService)
├── scripts/
│   ├── init.ts                # Template initializer (`bun run init`) for Light vs Standard
│   └── init.test.ts           # End-to-end tests for `bun run init` (`bun run test:init`)
├── web-app/
│   ├── api/                   # Rust Connect RPC + Axum + sqlx + PostgreSQL 18 RLS API (Standard)
│   ├── app/                   # Svelte 5 + SvelteKit 3 (adapter-bun) + shadcn-svelte + better-auth
│   │   └── src/lib/server/    # Core facade (backend.ts, auth.ts) + light/gcp/ + standard/
│   └── infra/
│       ├── gcp/               # Terraform (light/ and standard/ root modules)
│       │   ├── light/         # Scale-to-zero Cloud Run v2 + Firestore (<$10/month)
│       │   └── standard/      # Cloud Run v2 (app/api/migrate) + VPC + Cloud SQL PG 18
│       ├── aws/               # Placeholder for future AWS CDK
│       └── azure/             # Placeholder for future Azure Bicep
├── desktop/                   # Tauri desktop wrapper
├── AGENTS.md                  # Shared repository rules for AI agents
├── GEMINI.md                  # Antigravity / Gemini workspace rules (includes AGENTS.md)
├── compose.yaml               # Local Firestore Emulator (default) & PostgreSQL 18 (`standard` profile)
├── package.json               # Root scripts (`bun run init`, `bun run test:init`)
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
