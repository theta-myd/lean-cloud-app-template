# Architecture Documentation

This directory stores architecture diagrams (`.drawio` / `.drawio.svg`) and Architecture Decision Records (ADRs) for `lean-cloud-app-template`.

- **Light architecture (current focus):** <$10/month, Cloud Run `min-instance = 0`, single-container SvelteKit (`adapter-bun`) + low-cost datastore + Tauri desktop wrapper.
- **Standard architecture (future roadmap):** SvelteKit BFF + Rust API (`Connect RPC + Axum + sqlx + RLS`) + PostgreSQL.
