# desktop

Tauri v2 desktop wrapper for [`web-app/app`](../web-app/app/README.md) in the **Light** architecture.

## Overview

- **Local Development:** Loads `http://localhost:5173` (overridable via `LEAN_CLOUD_APP_URL`).
- **Production / Cloud Run:** Set `LEAN_CLOUD_APP_URL=https://<service>-<hash>.a.run.app` (at compile time or runtime) to wrap the deployed Cloud Run v2 service. If unset in a release build, the bundled [`public/index.html`](./public/index.html) setup page is displayed.
- **OS Browser Google OAuth + Deep Link:** Google blocks OAuth inside embedded WebViews (`disallowed_useragent`). The Rust shell intercepts navigations to `accounts.google.com` / `oauth2.googleapis.com` via `on_navigation`, opens them in the OS default browser (`tauri-plugin-opener`), enforces single-instance focus (`tauri-plugin-single-instance`), and handles `agentreadyapp://` Deep Link callbacks (`tauri-plugin-deep-link`).

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) with `clippy` and `rustfmt`
- [Bun](https://bun.sh/) (`bun install`)
- OS WebView runtime:
  - **Windows:** Microsoft Edge WebView2 Runtime (preinstalled on Windows 10/11) + MSVC Build Tools
  - **macOS:** Xcode Command Line Tools
  - **Linux:** `libwebkit2gtk-4.1-dev` and standard Tauri v2 system packages

## Local Development

1. Start the SvelteKit web app in `web-app/app/`:

   ```bash
   cd web-app/app
   bun install
   bun run --bun dev
   ```

2. In another terminal, install the Tauri CLI wrapper dependencies and launch the desktop window:

   ```bash
   cd desktop
   bun install
   bun run dev
   ```

3. To point the desktop shell at a deployed Cloud Run URL instead of `http://localhost:5173`:

   ```bash
   LEAN_CLOUD_APP_URL=https://<service>-<hash>.a.run.app bun run dev
   ```

## Deep Link & OAuth Flow

The shell registers the custom URI scheme `agentreadyapp://` in [`src-tauri/tauri.conf.json`](./src-tauri/tauri.conf.json):

- **`agentreadyapp://auth/callback?...`:** Rewrites onto `<app-origin>/api/auth/callback/google?...` and navigates the main WebView window, focusing and unminimizing the desktop app.
- **`agentreadyapp://open/<path>?<query>`:** Navigates the main WebView window to `<app-origin>/<path>?<query>` (sanitized to stay strictly within `<app-origin>`).
- **WebView OAuth Interception:** Any attempt to navigate directly to `https://accounts.google.com` or `https://oauth2.googleapis.com` inside the WebView is cancelled and handed off to the OS default browser via `tauri-plugin-opener`.
- **Linux / Windows Dev Registration:** In debug builds on Windows and on Linux, `register_all()` registers the `agentreadyapp://` scheme automatically for local testing. On Windows/macOS release installers (`bun run build`), the OS installer handles scheme registration.

## Verification & Build

Run formatting, lint, and unit tests from `desktop/` (or directly with `cargo`):

```bash
cd desktop
bun run check
```

Equivalent `cargo` commands inside `desktop/src-tauri/`:

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

To build a release installer pointing to Cloud Run:

```bash
LEAN_CLOUD_APP_URL=https://<service>-<hash>.a.run.app bun run build
```
