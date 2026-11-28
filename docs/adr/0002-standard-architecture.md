---
type: ADR
title: "ADR-0002: Standard Architecture Design (GCP / Rust Connect RPC API + Cloud SQL PostgreSQL RLS)"
description: "Defines the ~$12-$20/month Standard architecture on Google Cloud using Cloud Run v2 (Direct VPC Egress, public SvelteKit BFF + internal Rust Connect RPC/Axum/sqlx API + migrate Job), Better Auth PostgreSQL DB sessions, Cloud SQL for PostgreSQL (Private IP only), 4-layer security with tenant-scoped FORCE ROW LEVEL SECURITY, and Tauri."
tags:
  - architecture
  - gcp
  - cloud-run
  - cloud-sql
  - postgresql
  - rls
  - rust
  - connect-rpc
  - sveltekit
  - better-auth
  - tauri
  - terraform
status: draft
x-adr-id: "ADR-0002"
x-adr-status: "proposed"
x-adr-deciders:
  - "human:theta"
generated:
  by: "antigravity/gemini-4"
  at: "2026-11-28T12:25:00+09:00"
stale_after: "2027-05-28T00:00:00Z"
sources:
  - id: cloud-run-direct-vpc
    resource: https://cloud.google.com/run/docs/configuring/vpc-direct-vpc
    title: "Google Cloud Run Direct VPC Egress Configuration and Pricing"
    author: "team:google-cloud-docs"
  - id: cloud-run-pricing
    resource: https://cloud.google.com/run/pricing
    title: "Google Cloud Run Pricing & Always Free Tier"
    author: "team:google-cloud-docs"
  - id: cloud-run-s2s-auth
    resource: https://cloud.google.com/run/docs/authenticating/service-to-service
    title: "Google Cloud Run Service-to-Service Authentication (IAM & OIDC)"
    author: "team:google-cloud-docs"
  - id: cloud-run-ingress
    resource: https://cloud.google.com/run/docs/securing/ingress
    title: "Google Cloud Run Ingress Controls (Internal-Only Traffic)"
    author: "team:google-cloud-docs"
  - id: cloud-sql-pricing
    resource: https://cloud.google.com/sql/pricing
    title: "Cloud SQL for PostgreSQL Pricing"
    author: "team:google-cloud-docs"
  - id: cloud-sql-private-ip
    resource: https://cloud.google.com/sql/docs/postgres/private-ip
    title: "Cloud SQL for PostgreSQL Private IP & Private Services Access"
    author: "team:google-cloud-docs"
  - id: better-auth-postgres
    resource: https://www.better-auth.com/docs/adapters/postgresql
    title: "Better Auth PostgreSQL Database Adapter"
    author: "team:better-auth"
  - id: connect-rpc
    resource: https://connectrpc.com/docs/introduction
    title: "Connect RPC Protocol & Documentation"
    author: "team:bufbuild"
  - id: postgres-rls
    resource: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
    title: "PostgreSQL Row Security Policies (RLS)"
    author: "team:postgresql-docs"
  - id: roadmap-standard-issue
    resource: https://github.com/theta-myd/lean-cloud-app-template/issues/2
    title: "Roadmap: Add standard architecture variant (Rust API + PostgreSQL)"
    author: "human:theta"
  - id: okf-spec-v03
    resource: https://github.com/open-knowledge-format/open-knowledge-format
    title: "Open Knowledge Format (OKF) v0.3 Specification"
    author: "team:open-knowledge-format"
---

> Language: **English** | [日本語](../jp/adr/0002-standard-architecture.md)

# ADR-0002: Standard Architecture Design (GCP / Rust Connect RPC API + Cloud SQL PostgreSQL RLS)

- **Diagram:** [gcp/standard-architecture.drawio.svg](../architecture/gcp/standard-architecture.drawio.svg) (editable source: [gcp/standard-architecture.drawio](../architecture/gcp/standard-architecture.drawio))
- **Related ADR:** [ADR-0001: Light Architecture Design](./0001-light-architecture.md)
- **Roadmap & Implementation Tracking:** [Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2) (sub-issues `#30`–`#38`) | [compose.yaml](../../compose.yaml) | [web-app/infra/gcp/](../../web-app/infra/gcp/)

---

## 1. Context and Constraints

[ADR-0001](./0001-light-architecture.md) established the **Light** architecture (`<$10/month`, near `$0/month` idle) using a single Cloud Run container, Cloud Firestore Standard, and Better Auth Stateless Cookies. While ideal for indie apps and minimal prototypes, production multi-tenant SaaS applications often outgrow those trade-offs and require:

- **Relational data modeling & ACID transactions** in PostgreSQL rather than document-store queries.
- **Database-enforced multi-tenant isolation** via PostgreSQL Row-Level Security (`ENABLE` + `FORCE ROW LEVEL SECURITY`) rather than relying solely on application-layer `WHERE` clauses.
- **Immediate per-device session revocation** using DB-backed sessions instead of stateless cookies.
- **Strongly typed backend separation** with a dedicated, memory-safe Rust API service (`web-app/api/`) speaking schema-driven **Connect RPC** (Protobuf) behind the SvelteKit BFF (`web-app/app/`).[^roadmap-standard-issue]

### Light vs. Standard Comparison

| Dimension | Light Architecture ([ADR-0001](./0001-light-architecture.md)) | Standard Architecture (ADR-0002) |
| :--- | :--- | :--- |
| **Target Monthly Cost** | `<$10/month` (`$0` idle, `$0–$5` light) | `~$12–$20/month` (`~$10–$12` idle, `~$12–$20` light) |
| **Compute Topology** | 1 Cloud Run v2 service (`app`) | 2 Cloud Run v2 services (`app` public + `api` internal-only) + 1 Cloud Run v2 Job (`migrate`), all `min_instance_count = 0` |
| **Backend Language & RPC** | TypeScript inside SvelteKit BFF (`+page.server.ts`) | Dedicated Rust backend (`web-app/api/`) with Connect RPC + Axum + `sqlx` called by SvelteKit BFF |
| **Datastore** | Cloud Firestore Standard (Always Free daily tier) | Cloud SQL for PostgreSQL 17 Enterprise (`db-f1-micro` Zonal, **Private IP only** via PSA) |
| **Auth Sessions** | Better Auth Stateless Cookie (zero DB reads; no per-device instant revoke) | Better Auth PostgreSQL adapter (`auth` schema, DB-backed sessions + HttpOnly Cookie, instant per-device revoke) |
| **Multi-Tenant Isolation** | Application-scoped Firestore paths | 4-layer defense in depth ending in PostgreSQL `FORCE ROW LEVEL SECURITY` (`app_user` `NOBYPASSRLS`) |

### Key Constraints

1. **Lean fixed-cost ceiling:** Keep monthly Google Cloud spend around **`$12–$20/month`** at low/normal traffic (`~$10–$12/month` idle) by keeping all Cloud Run compute at `min_instance_count = 0`, using **Direct VPC Egress (`$0` compute & intra-region transfer)** instead of Serverless VPC Access Connectors (`~$14+/mo`), and avoiding Cloud Load Balancing (`~$18+/mo`) and Cloud NAT.
2. **Zero public database or API exposure:** Cloud SQL MUST have **no Public IP** (`ipv4_enabled = false`), and `web-app/api` MUST reject public Internet ingress (`INGRESS_TRAFFIC_INTERNAL_ONLY`) and unauthenticated callers.
3. **SvelteKit BFF routing invariant:** Preserve the template rule of using SvelteKit `load()` functions and form `actions` (`+page.server.ts` / `+layout.server.ts`) to talk to `web-app/api`; do not expose ad-hoc client `+server.ts` API proxies (only `/api/health` and `/api/auth/*`).
4. **Public template safety:** Zero real secrets, `.env` files, `*.tfvars`, or service account JSON keys in Git or CI/CD; authenticate GitHub Actions exclusively via Workload Identity Federation (OIDC).

---

## 2. Decisions

| Layer | Technology / Service | Rationale |
| :--- | :--- | :--- |
| **Compute (`app`, `api`, `migrate`)** | **Cloud Run v2** (`asia-northeast1` Tier 1, `min_instance_count = 0`, request-based billing) — public `app` service, internal-only `api` service, and `migrate` Cloud Run Job | All compute scales to zero and shares the generous Always Free tier (2M requests, 180k vCPU-sec, 360k GiB-sec/month).[^cloud-run-pricing] Running migrations in a dedicated Cloud Run Job decouples schema DDL from request-serving revisions. |
| **Networking & VPC Egress** | **Custom VPC + Subnet + Private Services Access (PSA)** + **Cloud Run Direct VPC Egress** (`private-ranges-only`) | Connects Cloud Run directly to VPC private IPs (Cloud SQL PSA peering) with **`$0` connector compute cost and `$0` intra-region transfer**, eliminating Serverless VPC Access Connectors and Cloud NAT.[^cloud-run-direct-vpc][^cloud-sql-private-ip] |
| **Web App / BFF** | **Svelte 5 + SvelteKit 3** (`adapter-bun`) + **non-root distroless** (`web-app/app/`) | Serves SSR, Better Auth, and Connect RPC client calls from `load()` / form `actions`. Supports switching cleanly between `ARCHITECTURE_VARIANT=light` and `standard`. |
| **UI** | **shadcn-svelte** (Home: `sidebar-07` with active tenant switcher / Login: `login-03`) + `mode-watcher` | Reuses the exact Light UI baseline while adding tenant context display and switching backed by `TenantService`. |
| **Authentication** | **Better Auth (PostgreSQL adapter)** in dedicated `auth` schema (`auth_user`) + **Google OAuth 2.0 only** (`openid`, `email`, `profile`) | Stores sessions in PostgreSQL (`auth.session`) paired with encrypted/signed HttpOnly cookies, enabling immediate per-device logout and server-side session revocation.[^better-auth-postgres] |
| **Backend API** | **Rust** (`web-app/api/`) — **Connect RPC** + **Axum** + **`sqlx`** + **non-root distroless** (Protobuf contracts in `proto/` managed by Buf) | Strongly typed HTTP/JSON & binary Protobuf RPC over standard HTTP/2, compile-time checked SQL / embedded migrations via `sqlx`, low cold-start latency, and small distroless binary footprint.[^connect-rpc] |
| **Database** | **Cloud SQL for PostgreSQL 17** (Enterprise edition, `db-f1-micro`, Zonal, 10 GB SSD, **Private IP only** `ipv4_enabled = false`, automated backups) | Lowest-cost managed PostgreSQL with native RLS, automated backups, and zero Public IPv4 surface or idle Public IP charges.[^cloud-sql-pricing][^cloud-sql-private-ip] |
| **Desktop** | **Tauri** (`desktop/` wrapping `web-app/app`) | Unchanged from ADR-0001: delegates Google OAuth to the OS browser and returns via Deep Link callback to avoid WebView `disallowed_useragent` blocks. |
| **Ingress** | **Cloud Run default HTTPS (`*.run.app`)** for `app`; **`INGRESS_TRAFFIC_INTERNAL_ONLY`** for `api` | Avoids Cloud Load Balancing fixed fees (`~$18+/mo`) while ensuring `api` is unreachable from the public Internet.[^cloud-run-ingress] Custom domains/CDN can later use optional Firebase Hosting. |
| **Registry** | **Artifact Registry** + Cleanup Policy | Stores `app` and `api` distroless images with automated cleanup keeping the latest 2–3 versions inside or near the 0.5 GiB Always Free tier. |
| **Secrets** | **Secret Manager** (two-step Terraform bootstrap) | Stores `better-auth-secret`, `google-client-id`, `google-client-secret`, `internal-api-jwt-secret`, `auth-database-url`, `api-database-url`, and `migrator-database-url`. |
| **CI/CD** | **GitHub Actions + Workload Identity Federation (OIDC)** | Keyless build, push, `migrate` Cloud Run Job execution, and `api` / `app` Cloud Run deployments via short-lived OIDC tokens. |
| **Observability & Guardrails** | **Cloud Logging / Monitoring** (structured JSON logs via `tracing`) + **Cloud Billing Budget** (`$10` / `$15` / `$20`) | Fits inside the 50 GiB/month free logging tier; staged budget alerts at 50% (`$10`), 75% (`$15`), and 100% (`$20`) protect against runaway Cloud SQL or egress spend. |

---

## 3. Monthly Cost Estimate and Overrun Risks

Unlike Light mode, **Cloud SQL for PostgreSQL does not support native scale-to-zero** and incurs a predictable baseline monthly charge whenever the instance is running.[^cloud-sql-pricing]

### Estimated Monthly Cost (`asia-northeast1`)

| Service | Configuration / Free Tier Summary | Idle | Light Traffic |
| :--- | :--- | :--- | :--- |
| Cloud SQL for PostgreSQL (`db-f1-micro`, Zonal) | Enterprise edition shared-core compute (`~$7.67/mo` at 730 hrs/mo)[^cloud-sql-pricing] | ~$7.67 | ~$7.67 |
| Cloud SQL Storage & Backups | 10 GB SSD (`~$2.00/mo`) + automated backups (`~$0–$0.80/mo`, Private IP `$0`)[^cloud-sql-pricing][^cloud-sql-private-ip] | ~$2.00–$2.80 | ~$2.00–$3.50 |
| Cloud Run v2 (`app`, `api`, `migrate` Job) | `min_instance_count = 0`; 2M req / 180k vCPU-sec / 360k GiB-sec Always Free[^cloud-run-pricing] | $0 | $0–$2.50 |
| Direct VPC Egress & Private Services Access | No connector VMs; intra-region VPC transfer `$0`[^cloud-run-direct-vpc] | $0 | $0 |
| Artifact Registry | 0.5 GiB Always Free (with Cleanup Policy keeping recent 3 versions) | $0 | $0–$0.20 |
| Secret Manager | 6 active versions free, `$0.06/version/mo` thereafter (7 secrets -> 1 paid version) + 10k accesses free | ~$0.06 | ~$0.06 |
| Cloud Logging | 50 GiB / month Always Free | $0 | $0 |
| **Total** | — | **~$10–$12 / mo** | **~$12–$20 / mo** |

### Key Overrun Risks & Mitigations

- **Cloud SQL always-on baseline cost:** Even at zero traffic, a running `db-f1-micro` instance costs `~$10–$12/month`.
  - **Stop when unused (dev/staging):** Pause compute billing with `gcloud sql instances patch <instance-name> --activation-policy=NEVER` (only storage remains billed at `~$2/month`), and resume with `--activation-policy=ALWAYS`.
  - **Destroy disposable environments:** For temporary verification or feature environments, run `terraform destroy` cleanly (see `db_deletion_protection` and `psa_deletion_policy` in Section 6).
- **Accidental HA, Public IPv4, or tier upgrade:** Switching Cloud SQL to `REGIONAL` (HA) roughly doubles compute/storage cost, and enabling `ipv4_enabled = true` incurs idle IPv4 charges while widening the attack surface. Terraform pins `availability_type = "ZONAL"`, `tier = "db-f1-micro"`, and `ipv4_enabled = false` by default.
- **Accidental Serverless VPC Access Connector or Cloud NAT:** Adding a legacy VPC Connector (`~$14+/mo`) or Cloud NAT (`~$32+/mo` gateway + per-GB charges) breaks the `$20/month` ceiling. Always use Direct VPC Egress with `vpc_egress = "PRIVATE_RANGES_ONLY"` so public egress (Google OAuth, package APIs) flows directly via Cloud Run's default egress path.
- **Unbounded storage or Artifact Registry growth:** Cap Cloud SQL `disk_autoresize_limit` (e.g., `20` GB) and enforce Artifact Registry cleanup policies (delete untagged >7d, tagged >30d, keep recent 3 versions).
- **Budget alerts:** Enable the optional Cloud Billing Budget (`budget_amount_usd = 20`) alerting at `$10` (50%), `$15` (75%), and `$20` (100%).

---

## 4. 4-Layer Security & Tenant RLS Design

To ensure that neither a network misconfiguration, a compromised client, nor a missing SQL `WHERE` clause can leak cross-tenant data, the Standard architecture enforces **four independent defense-in-depth layers**:

```text
Browser / Tauri
  │  HTTPS (Better Auth HttpOnly Session Cookie)
  ▼
[Cloud Run: web-app/app (SvelteKit BFF, Public HTTPS)]
  │  1. Validates session in PostgreSQL `auth` schema (`auth_user`)
  │  2. Fetches Google OIDC ID Token (Metadata Server -> Authorization: Bearer)
  │  3. Signs short-lived HMAC-SHA256 JWT (`x-app-user-token`: sub, email, tid)
  │  4. Calls `web-app/api` over Direct VPC Egress (private-ranges-only)
  ▼
[Cloud Run: web-app/api (Rust Connect RPC / Axum, INTERNAL_ONLY + IAM)]
  │  Layer 1: Rejects non-internal ingress (INGRESS_TRAFFIC_INTERNAL_ONLY)
  │  Layer 2: Verifies Google OIDC ID Token (`roles/run.invoker` = `app-runtime` SA only)
  │  Layer 3: Verifies `x-app-user-token` HMAC-SHA256 + checks `app.tenant_memberships`
  │  Layer 4: Opens TX -> `SELECT set_config('app.current_tenant_id', $1, true)`
  ▼
[Cloud SQL for PostgreSQL (Private IP only via PSA)]
  └─ `app` schema accessed as `app_user` (`NOSUPERUSER NOBYPASSRLS`)
     with `ENABLE` & `FORCE ROW LEVEL SECURITY` on all tenant-scoped tables
```

### Layer 1: Network Boundary (Private-Only East-West & Database)

- **`web-app/api` internal-only ingress:** Deployed with `ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"`, blocking direct requests from the public Internet at the Google Front End before they reach the container.[^cloud-run-ingress]
- **Cloud SQL Private IP only:** Deployed with `ipv4_enabled = false`, exposing no public IPv4 address. Connectivity exists exclusively via **Private Services Access (PSA)** VPC peering inside the custom VPC.[^cloud-sql-private-ip]
- **Direct VPC Egress (`PRIVATE_RANGES_ONLY`):** Attached to `app`, `api`, and the `migrate` Cloud Run Job. Private RFC 1918 traffic routes directly into the custom VPC subnet at `$0` compute cost, while public outbound traffic (e.g., Google OAuth token exchange from `app`) bypasses the VPC without requiring Cloud NAT.[^cloud-run-direct-vpc]

### Layer 2: Service-to-Service IAM (Google OIDC)

- **Strict Cloud Run IAM enforcement:** `web-app/api` is deployed without `allUsers` invoker access (`--no-allow-unauthenticated`).
- **Least-privilege invoker binding:** Only the dedicated `app-runtime` Service Account receives `roles/run.invoker` on `web-app/api`. Neither `api-runtime` nor `migrator` can invoke `api`.
- **OIDC ID Token propagation:** Before calling `web-app/api`, the SvelteKit BFF requests and caches a Google-signed OIDC ID Token from the Cloud Run metadata server with `audience = <API_BASE_URL>` and sends it in `Authorization: Bearer <id_token>`.[^cloud-run-s2s-auth] In local development (non-GCP), the metadata token fetch is cleanly bypassed.
- **Role separation across Service Accounts:**
  - `app-runtime`: `roles/run.invoker` (scoped to `api` only) + `roles/secretmanager.secretAccessor` (on `app` secrets only).
  - `api-runtime`: `roles/secretmanager.secretAccessor` (on `api` secrets only).
  - `migrator`: `roles/secretmanager.secretAccessor` (on `migrator-database-url` only).
  - `github-deployer` (WIF/OIDC): Artifact Registry writer (repo-scoped), Cloud Run developer, and `iam.serviceAccountUser` on the runtime/migrator SAs.

### Layer 3: Signed User Assertion & Tenant Membership Verification

Because Cloud Run IAM consumes the `Authorization: Bearer` header for the Google OIDC service identity token, end-user identity is propagated in a separate application header:

- **Short-lived signed JWT (`x-app-user-token`):** After validating the incoming Better Auth session cookie against `auth.session`, the SvelteKit BFF mints a short-lived (e.g., 60-second TTL) **HMAC-SHA256** JWT signed with `INTERNAL_API_JWT_SECRET` (shared via Secret Manager between `app` and `api`). Claims include:
  - `sub`: authenticated Better Auth `user.id`
  - `email`: verified email address
  - `tid` (optional): requested active `tenant_id` (UUID)
  - `iat` / `exp`: issued-at and short expiration timestamps
- **Middleware verification in Rust (`web-app/api`):**
  1. Verifies the HMAC-SHA256 signature and `exp` window; rejects missing, tampered, or expired tokens with `Unauthenticated`.
  2. Resolves the effective tenant against PostgreSQL `app.tenant_memberships (user_id, tenant_id, role)` via a tightly scoped `SECURITY DEFINER` membership lookup helper (so the caller cannot spoof an arbitrary `tid` belonging to another tenant); rejects non-members with `PermissionDenied`.
- **Personal tenant auto-bootstrap:** When a newly signed-in user has no existing tenant membership (or invokes `TenantService.EnsurePersonalTenant`), `web-app/api` atomically creates a personal tenant row in `app.tenants` and links the user with `role = 'owner'` in `app.tenant_memberships`.

### Layer 4: PostgreSQL Schema, Role & Row-Level Security (RLS) Isolation

The single Cloud SQL PostgreSQL database is partitioned into two strictly isolated schemas and three least-privilege database roles:

| PostgreSQL Role | Used By | Privileges | RLS Bypass? |
| :--- | :--- | :--- | :--- |
| `migrator` | Cloud Run Job (`migrate`, `sqlx`) | Schema owner / DDL on `app` (and bootstrap DDL on `auth` if managed together) | Owner (never used by runtime apps) |
| `auth_user` | `web-app/app` (Better Auth) | DML only (`SELECT/INSERT/UPDATE/DELETE`) on `auth.*`; **zero access to `app.*`** | `NOSUPERUSER NOBYPASSRLS` |
| `app_user` | `web-app/api` (Rust `sqlx`) | DML only (`SELECT/INSERT/UPDATE/DELETE`) on `app.*`; **zero access to `auth.*`** | `NOSUPERUSER NOBYPASSRLS` |

- **Dedicated `auth` schema (`auth_user`):** Isolates Better Auth tables (`user`, `session`, `account`, `verification`) from domain data. DB-backed sessions paired with HttpOnly cookies resolve the Light-mode stateless revocation trade-off by allowing immediate per-device logout and session invalidation.[^better-auth-postgres]
- **Tenant-scoped `app` schema (`app_user` + `FORCE ROW LEVEL SECURITY`):**
  - Every tenant-scoped table (e.g., `app.todos`, `app.tenants`, `app.tenant_memberships`) enables both `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `ALTER TABLE ... FORCE ROW LEVEL SECURITY`.[^postgres-rls]
  - Policies enforce tenant isolation using a fail-closed expression:
    ```sql
    USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
    ```
    If `app.current_tenant_id` is unset or empty, `nullif(..., '')` returns `NULL`, causing all row predicates to evaluate to `false` (fail-closed: zero rows returned or mutated).
  - **Transaction-local tenant binding (connection-pool safe):** Because `sqlx` pools persistent PostgreSQL connections across concurrent requests, the Rust API middleware opens a transaction for each tenant-scoped request and executes:
    ```sql
    SELECT set_config('app.current_tenant_id', $1, true);
    ```
    Setting `is_local = true` guarantees PostgreSQL clears `app.current_tenant_id` automatically on `COMMIT` or `ROLLBACK`, preventing tenant context bleed between pooled requests.
  - **Automated verification:** Rust integration tests connect as `app_user` (`NOBYPASSRLS`) and explicitly assert that Tenant A cannot read, update, or delete Tenant B's rows, and that queries without `app.current_tenant_id` return zero rows.

---

## 5. Access Control, E2E Test Auth, and Local Development

### 5.1 Restricted User Access (Allowlist Authorization)

Standard mode retains the same environment-based allowlist controls established in [ADR-0001](./0001-light-architecture.md) as the default gate for private/invite-only deployments:

- **Environment variables:**
  - `AUTH_ACCESS_MODE`: `allowlist` (template default) or `open`
  - `ALLOWED_EMAILS`: Comma-separated allowed email addresses
  - `ALLOWED_DOMAINS`: Comma-separated allowed domains (e.g., Google Workspace domains)
- **Enforcement:** Validate `email` and `emailVerified === true` in both the Better Auth OAuth callback hook and SvelteKit `hooks.server.ts`. Because Standard mode already provisions PostgreSQL, teams that later need dynamic in-app invitation workflows can extend this check to a PostgreSQL allowlist table without changing the surrounding architecture.

### 5.2 E2E Test Email / Password Login (Env-Gated)

To keep Playwright E2E tests deterministic without automating Google's production OAuth consent flow:

- **Environment variables:**
  - `ENABLE_E2E_PASSWORD_AUTH="false"` (**MUST remain `"false"` in production Cloud Run**, enforced in Terraform)
  - `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` (populated only in local/CI E2E runs)
- **Behavior:**
  - **UI (`login-03`):** Displays the Email / Password form only when `ENABLE_E2E_PASSWORD_AUTH=true`; production displays only the Google Sign-In button.
  - **Backend (Better Auth):** In Standard mode with `ENABLE_E2E_PASSWORD_AUTH=true`, Better Auth enables `emailAndPassword` against the local/CI PostgreSQL `auth` schema and seeds the single test user on startup, exercising real DB-backed session cookies, `x-app-user-token` signing, Connect RPC calls, and PostgreSQL RLS end to end.

### 5.3 Local Development (PostgreSQL 17 Compose Profile)

Local development supports both Light and Standard architectures from the same root [compose.yaml](../../compose.yaml) without breaking the existing Light Firestore Emulator workflow:

- **Docker Compose (`standard` profile):** Start PostgreSQL 17 locally with `docker compose --profile standard up -d` (while `docker compose up -d` continues to start only the Light Firestore Emulator). On Windows with `wslc` (which lacks a `compose` subcommand), run a standalone `wslc run` container mounting the PostgreSQL init SQL directory.
- **Bootstrap init SQL:** Mounted under `/docker-entrypoint-initdb.d/` to create the `auth` and `app` schemas along with least-privilege `auth_user`, `app_user` (`NOSUPERUSER NOBYPASSRLS`), and `migrator` roles matching Cloud SQL production.
- **Full local fidelity:** Running `web-app/app` (`ARCHITECTURE_VARIANT=standard`) against local `web-app/api` and local PostgreSQL bypasses only the GCP metadata server OIDC ID token call (Layer 2); Better Auth DB sessions, `x-app-user-token` HMAC verification (Layer 3), and PostgreSQL `FORCE ROW LEVEL SECURITY` (Layer 4) execute identically to production.

---

## 6. Terraform Layout & Operations (`web-app/infra/gcp/`)

To keep Light and Standard infrastructures cleanly isolated, independently validated in CI, and selectable via the planned `bun run init` switcher ([Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2), Issue `#35`, Issue `#37`), GCP Terraform is organized into two sibling root modules under [web-app/infra/gcp/](../../web-app/infra/gcp/) in alignment with OKF v0.3 operational governance:[^okf-spec-v03]

- **`web-app/infra/gcp/light/`** — Existing Light architecture stack ([ADR-0001](./0001-light-architecture.md): single Cloud Run v2 service + Cloud Firestore Standard).
- **`web-app/infra/gcp/standard/`** — Standard architecture stack:
  - `versions.tf` / `providers.tf` — Terraform and `hashicorp/google` provider config (with GCS remote state guide).
  - `variables.tf` / `terraform.tfvars.example` — `project_id`, `region` (`asia-northeast1`), `db_tier` (`db-f1-micro`), `budget_amount_usd` (`20`), `enable_secret_env_refs`, `auth_access_mode` (`allowlist`), `db_deletion_protection` (`true` default; set `false` for disposable test/verification runs), and `psa_deletion_policy` (supports `"ABANDON"` so `terraform destroy` does not stall on Google Cloud's asynchronous PSA peering release).
  - `apis.tf` — Enables `run`, `sqladmin`, `compute`, `servicenetworking`, `artifactregistry`, `secretmanager`, `iam`, `iamcredentials`, `cloudresourcemanager` (and optional `billingbudgets`).
  - `network.tf` — Custom VPC, Subnet (`asia-northeast1`), PSA reserved IP range, and `google_service_networking_connection` (honoring `var.psa_deletion_policy`).
  - `cloud_sql.tf` — Cloud SQL for PostgreSQL 17 Enterprise (`db-f1-micro`, `availability_type = "ZONAL"`, `ipv4_enabled = false`, Private IP attached to custom VPC, automated backups, `deletion_protection = var.db_deletion_protection`).
  - `cloud_run.tf` — Cloud Run v2 `app` service (public HTTPS, Direct VPC Egress `PRIVATE_RANGES_ONLY`, `min_instance_count = 0`, `ENABLE_E2E_PASSWORD_AUTH = "false"`), internal `api` service (`INGRESS_TRAFFIC_INTERNAL_ONLY`, IAM auth required, Direct VPC Egress `PRIVATE_RANGES_ONLY`, `min_instance_count = 0`), and `migrate` Cloud Run v2 Job (`sqlx` migrations via Direct VPC Egress).
  - `iam.tf` — Separate least-privilege SAs (`app-runtime` with `roles/run.invoker` on `api` only, `api-runtime`, `migrator`) and optional GitHub Actions WIF Pool / Provider + Deployer SA.
  - `secrets.tf` — Two-step Secret Manager bootstrap (`enable_secret_env_refs = false` -> populate versions out-of-band -> `true`) for all 7 secrets (`better-auth-secret`, `google-client-id`, `google-client-secret`, `internal-api-jwt-secret`, `auth-database-url`, `api-database-url`, `migrator-database-url`).
  - `artifact_registry.tf` — Docker repository with cleanup policies (delete untagged >7d, tagged >30d, keep recent `artifact_keep_count` versions).
  - `budget.tf` — Optional Cloud Billing Budget (50% / 75% / 100% thresholds -> `$10` / `$15` / `$20`).
  - `outputs.tf` — `app` URL, `api` internal URL, Cloud SQL Private IP, WIF Provider name, Artifact Registry URL, and `migrate` Job name.

Multi-cloud Standard infrastructure equivalents (`web-app/infra/aws/` with AWS CDK and `web-app/infra/azure/` with Azure Bicep) remain tracked as future roadmap phases under [Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2).[^roadmap-standard-issue]

[^cloud-run-direct-vpc]: Google Cloud Run Direct VPC Egress Configuration and Pricing
[^cloud-run-pricing]: Google Cloud Run Pricing & Always Free Tier
[^cloud-run-s2s-auth]: Google Cloud Run Service-to-Service Authentication (IAM & OIDC)
[^cloud-run-ingress]: Google Cloud Run Ingress Controls (Internal-Only Traffic)
[^cloud-sql-pricing]: Cloud SQL for PostgreSQL Pricing
[^cloud-sql-private-ip]: Cloud SQL for PostgreSQL Private IP & Private Services Access
[^better-auth-postgres]: Better Auth PostgreSQL Database Adapter
[^connect-rpc]: Connect RPC Protocol & Documentation
[^postgres-rls]: PostgreSQL Row Security Policies (RLS)
[^roadmap-standard-issue]: Roadmap: Add standard architecture variant (Rust API + PostgreSQL)
[^okf-spec-v03]: Open Knowledge Format (OKF) v0.3 Specification
