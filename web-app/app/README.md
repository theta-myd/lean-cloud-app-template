# web-app/app

Frontend and BFF application (planned):

- **Framework:** Svelte 5 + SvelteKit 3 (`adapter-bun`)
- **UI:** `shadcn-svelte` (including the `shadcn-svelte` agent skill under `web-app/app/`)
- **Auth:** `better-auth` (with Google OAuth)
- **Container:** Multi-stage build with a **distroless** runtime image targeting Cloud Run (`min-instance = 0`)

Copy `.env.example` to `.env` for local development (never commit `.env`).
