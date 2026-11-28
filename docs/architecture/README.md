> Language: **English** | [日本語](../jp/architecture/README.md)

# Architecture Diagrams

This directory stores architecture diagrams (`.drawio` / `.drawio.svg`) organized by cloud provider (`gcp/`, with `aws/` and `azure/` planned).
Architecture Decision Records (ADRs) are maintained in [../adr/index.md](../adr/index.md) using the Open Knowledge Format (OKF) v0.3 bundle format.

## Google Cloud (`gcp/`)

### Light Architecture

![Light Architecture (GCP)](./gcp/light-architecture.drawio.svg)

- **Editable Diagram:** [gcp/light-architecture.drawio](./gcp/light-architecture.drawio)
- **ADR (OKF v0.3):** [ADR-0001: Light Architecture Design](../adr/0001-light-architecture.md)
- **Summary:** `<$10/month`, Cloud Run v2 (`min_instance_count = 0`, `asia-northeast1`), single-container Svelte 5 + SvelteKit 3 (`adapter-bun`, distroless, `shadcn-svelte` `sidebar-07` / `login-03`), `better-auth` Stateless Cookie + Google OAuth only (with env-based Allowlist & E2E toggle), Cloud Firestore Standard (Always Free tier), and Tauri desktop wrapper (OS browser + Deep Link OAuth).

### Standard Architecture (Roadmap in Progress)

![Standard Architecture (GCP)](./gcp/standard-architecture.drawio.svg)

- **Editable Diagram:** [gcp/standard-architecture.drawio](./gcp/standard-architecture.drawio)
- **Roadmap Tracking:** [Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2) (sub-issues #30–#38)
- **Summary:** `~$12–$20/month`, Cloud Run v2 (`min_instance_count = 0`, `asia-northeast1`) with **Direct VPC Egress (`$0` compute & intra-region transfer)**, two services (`web-app/app` SvelteKit BFF public HTTPS + `web-app/api` Rust Connect RPC / Axum / `sqlx` on **`INGRESS_TRAFFIC_INTERNAL_ONLY`** with Cloud Run IAM `roles/run.invoker`), **Better Auth PostgreSQL DB sessions** (`auth` schema / `auth_user`, HttpOnly Cookie with immediate revocation), **Cloud SQL for PostgreSQL** (Enterprise `db-f1-micro` Zonal, **Private IP only** via Private Services Access), tenant-scoped **PostgreSQL `ENABLE & FORCE ROW LEVEL SECURITY`** (`app_user` `NOBYPASSRLS`, verified against `tenant_memberships` via signed `x-app-user-token`), and a Cloud Run Job for `sqlx` migrations.

## AWS & Azure (`aws/`, `azure/` — Planned)

- Multi-cloud architecture diagrams matching `web-app/infra/aws/` (AWS CDK) and `web-app/infra/azure/` (Azure Bicep) are tracked as future roadmap items in [Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2).
