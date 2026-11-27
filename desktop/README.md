# desktop

Planned **Tauri** desktop application wrapping `web-app/app`.

### Design Notes
- **Google OAuth on Desktop:** Google blocks OAuth inside embedded WebViews (`disallowed_useragent`). The desktop app will delegate Google sign-in to the OS default browser and return the session via a custom URL scheme (Deep Link).
