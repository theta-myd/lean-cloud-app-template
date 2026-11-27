# web-app/app

Frontend and BFF application for the **Light** architecture:

- **Framework:** Svelte 5 + SvelteKit 3 (`@sveltejs/adapter-bun`)
- **UI & Theme:** `shadcn-svelte` (`sidebar-07` Home layout, `login-03` Login layout) with `mode-watcher` (`light` / `dark` / `system`), plus local agent skills in `.agents/skills/` (`shadcn-svelte`, `svelte-code-writer`, `svelte-core-bestpractices`)
- **Data Loading & Mutations:** Prefer SvelteKit `load()` and form `actions` in `+page.server.ts`; reserve `+server.ts` API routes for health checks (`/api/health`), auth handlers (`/api/auth/*`), async jobs, or external webhooks
- **Auth:** `better-auth` (Stateless encrypted JWE Cookie + Google OAuth in production; env-gated `bun:sqlite :memory:` email/password mode for local/E2E testing)
- **Access Control:** `AUTH_ACCESS_MODE` (`allowlist` | `open`), `ALLOWED_EMAILS`, `ALLOWED_DOMAINS`
- **Datastore:** `@google-cloud/firestore` (connects automatically to the local Firestore Emulator when `FIRESTORE_EMULATOR_HOST` is set)
- **Container:** Multi-stage `Dockerfile` targeting `oven/bun:distroless` (`USER nonroot`, `PORT=8080`)

## Local Development

```bash
# 1. Start the local Firestore Emulator (Docker Compose from repo root, or wslc run on Windows)
docker compose up -d
# Windows wslc (no compose subcommand):
# wslc run -d --rm --name firestore-emulator -p 8080:8080 gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators gcloud emulators firestore start --host-port=0.0.0.0:8080

# 2. Configure environment variables
cp .env.example .env

# 3. Install dependencies and run the dev server
bun install
bun run --bun dev
```

For quick local UI preview without setting up Google OAuth credentials, set `ENABLE_E2E_PASSWORD_AUTH=true`, `E2E_TEST_EMAIL`, and `E2E_TEST_PASSWORD` in `.env` (keep `ENABLE_E2E_PASSWORD_AUTH=false` in production).

## Typecheck & Production Build

```bash
bun run check
bun run --bun build
```
