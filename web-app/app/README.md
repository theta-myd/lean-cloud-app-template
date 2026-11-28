# web-app/app

Frontend and BFF application supporting both **Light** and **Standard** architectures:

- **Framework:** Svelte 5 + SvelteKit 3 (`@sveltejs/adapter-bun`)
- **UI & Theme:** `shadcn-svelte` (`sidebar-07` Home layout, `login-03` Login layout) with `mode-watcher` (`light` / `dark` / `system`), plus local agent skills in `.agents/skills/` (`shadcn-svelte`, `svelte-code-writer`, `svelte-core-bestpractices`)
- **Data Loading & Mutations:** Prefer SvelteKit `load()` and form `actions` in `+page.server.ts`; reserve `+server.ts` API routes for health checks (`/api/health`), auth handlers (`/api/auth/*`), async jobs, or external webhooks
- **Auth:** `better-auth` + Google OAuth 2.0 (Stateless encrypted JWE Cookie in Light GCP mode; PostgreSQL `auth` schema DB sessions in Standard mode; env-gated `bun:sqlite :memory:` email/password mode for local/E2E testing)
- **Access Control:** `AUTH_ACCESS_MODE` (`allowlist` | `open`), `ALLOWED_EMAILS`, `ALLOWED_DOMAINS`
- **Container:** Multi-stage `Dockerfile` targeting `oven/bun:distroless` (`USER nonroot`, `PORT=8080`)

## BFF Server Layout (`src/lib/server/`)

Variant-specific server code is cleanly isolated behind `src/lib/server/backend.ts` so routes never import datastore or RPC modules directly, and `bun run init` can remove the unused variant without leaving dead code:

```text
src/lib/server/
├── allowlist.ts           # Core: email/domain allowlist authorization
├── auth.ts                # Core: Better Auth setup (delegates session store to backend.ts)
├── backend.ts             # Core: SINGLE variant entry point (locked to one adapter by bun run init)
├── env.ts                 # Core: typed environment config & production guardrails
├── security-headers.ts    # Core: CSP & HTTP security headers
├── todos-repo.ts          # Core: thin domain facade delegating to backend.ts
├── types.ts               # Core: shared BackendAdapter & domain types
├── light/                 # Removed by `bun run init --variant=standard`
│   ├── index.ts           # Light BackendAdapter (cloud-pluggable; GCP today, future AWS Aurora DSQL)
│   └── gcp/
│       └── firestore.ts   # Direct BFF -> Cloud Firestore CRUD
└── standard/              # Removed by `bun run init --variant=light` (along with src/lib/gen/)
    ├── index.ts           # Standard BackendAdapter (cloud-agnostic BFF -> Rust API)
    ├── auth-db.ts         # Dedicated PostgreSQL `auth` schema pool for Better Auth only
    ├── api-client.ts      # Connect RPC client (TenantService, TodoService)
    ├── internal-jwt.ts    # Short-lived HS256 `x-app-user-token` signer/verifier
    └── gcp-id-token.ts    # GCP Cloud Run OIDC ID token helper (cloud-specific IAM plug-in)
```

## Local Development

### Light Mode (Default)

```bash
# 1. Start the local Firestore Emulator from repo root
docker compose up -d

# 2. Configure environment variables
cp .env.example .env

# 3. Install dependencies and run the dev server
bun install
bun run --bun dev
```

### Standard Mode

```bash
# 1. Start local PostgreSQL 18 (from repo root)
docker compose --profile standard up -d postgres

# 2. Run migrations & start the Rust API in web-app/api/
# (See web-app/api/README.md)

# 3. Set ARCHITECTURE_VARIANT=standard, AUTH_DATABASE_URL, API_BASE_URL, and
#    INTERNAL_API_JWT_SECRET in web-app/app/.env, then run:
bun install
bun run --bun dev
```

For quick local UI preview without setting up Google OAuth credentials, set `ENABLE_E2E_PASSWORD_AUTH=true`, `E2E_TEST_EMAIL`, and `E2E_TEST_PASSWORD` in `.env` (keep `ENABLE_E2E_PASSWORD_AUTH=false` in production).

## Typecheck, Unit Tests & Production Build

```bash
bun run --bun check
bun run --bun test:unit
bun run --bun build
```
