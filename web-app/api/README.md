# web-app/api

Rust backend API service for the **Standard** architecture of `lean-cloud-app-template` ([ADR-0002](../../docs/adr/0002-standard-architecture.md)).

Implements **Connect RPC** (`application/json` and `application/proto`) over **Axum** and **`sqlx`** with **PostgreSQL `FORCE ROW LEVEL SECURITY`**, packaged in a hardened multi-stage **distroless** container image.

## Endpoints

| Method & Path | Auth | Description |
| :--- | :--- | :--- |
| `GET /healthz` | Public (internal Cloud Run probe) | Returns `200 OK` JSON `{"status":"ok","service":"lean-cloud-app-api"}` |
| `POST /tenant.v1.TenantService/EnsurePersonalTenant` | `x-app-user-token` | Idempotently provisions and returns the caller's personal tenant |
| `POST /tenant.v1.TenantService/ListTenants` | `x-app-user-token` | Lists tenants the caller belongs to |
| `POST /tenant.v1.TenantService/GetActiveTenant` | `x-app-user-token` | Resolves and validates the caller's active tenant |
| `POST /todo.v1.TodoService/ListTodos` | `x-app-user-token` | Lists tasks in the caller's authorized tenant (newest-first) |
| `POST /todo.v1.TodoService/CreateTodo` | `x-app-user-token` | Creates a new task in the caller's authorized tenant |
| `POST /todo.v1.TodoService/UpdateTodo` | `x-app-user-token` | Updates a task title within the caller's authorized tenant |
| `POST /todo.v1.TodoService/ToggleTodo` | `x-app-user-token` | Toggles task completion within the caller's authorized tenant |
| `POST /todo.v1.TodoService/DeleteTodo` | `x-app-user-token` | Deletes a task within the caller's authorized tenant |

Protobuf definitions live in [`../../proto/`](../../proto/) and are compiled by `build.rs` using `prost-build` + `pbjson-build`.

## Security & Tenant RLS Model

1. **Signed User Assertion (`x-app-user-token`):** Every RPC endpoint validates a short-lived HS256 JWT (`iss = "lean-cloud-app-bff"`, `aud = "lean-cloud-app-api"`, non-empty `sub`, 10s `exp` leeway) signed with `INTERNAL_API_JWT_SECRET`.
2. **Membership Verification (`SECURITY DEFINER` helpers):** Tenant lookup and personal tenant provisioning run via `app.resolve_user_tenant`, `app.list_user_tenants`, and `app.ensure_personal_tenant`. Requesting an unauthorized `tenant_id` fails with Connect `permission_denied` (`403`).
3. **Transaction-Local RLS Binding (`app_user`, `NOBYPASSRLS`):** Every `TodoService` query runs inside a `sqlx` transaction after executing:
   ```sql
   SELECT set_config('app.current_tenant_id', $1, true);
   ```
   All tenant tables (`app.tenants`, `app.tenant_memberships`, `app.todos`) enforce both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with fail-closed policies bound to `nullif(current_setting('app.current_tenant_id', true), '')::uuid`.

## Local Development

### Prerequisites

- Rust toolchain (`cargo`, `rustfmt`, `clippy`)
- `protoc` (Protocol Buffers compiler)
- Docker (for local PostgreSQL 18 via root `compose.yaml`)

### 1. Start PostgreSQL 18 (Standard profile)

From the repository root:

```bash
docker compose --profile standard up -d --wait postgres
```

### 2. Run Embedded SQL Migrations (`--migrate-only`)

Migrations run using the schema-owner `migrator` role (and do **not** require `INTERNAL_API_JWT_SECRET`):

```bash
cd web-app/api
DATABASE_URL="postgres://migrator:local-dev-migrator-password@127.0.0.1:5432/app" \
  cargo run -- --migrate-only
```

### 3. Run the API Server (`app_user`, `NOBYPASSRLS`)

```bash
cd web-app/api
DATABASE_URL="postgres://app_user:local-dev-app-password@127.0.0.1:5432/app" \
INTERNAL_API_JWT_SECRET="CHANGE_ME_LOCAL_DEV_INTERNAL_API_JWT_SECRET_32_BYTES_MIN" \
PORT=8080 \
RUST_LOG=info \
  cargo run
```

## Testing & Verification

```bash
cd web-app/api

# Unit tests only (no PostgreSQL required)
cargo test --lib

# Full suite including PostgreSQL RLS integration tests
# (requires `docker compose --profile standard up -d --wait postgres`)
cargo test

# Formatting & lint checks
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

## Container Build (Distroless)

Build from the **repository root** so `proto/` and `web-app/api/` are both available in the Docker build context:

```bash
docker build -f web-app/api/Dockerfile -t lean-cloud-app-api .
```

The resulting `gcr.io/distroless/cc-debian12:nonroot` image serves HTTP on `PORT=8080` by default and accepts `--migrate-only` as a container argument for Cloud Run Jobs.
