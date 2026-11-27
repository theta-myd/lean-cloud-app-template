> 言語: [English](../../architecture/README.md) | **日本語**

# アーキテクチャ図

このディレクトリ（`docs/architecture/`）にはアーキテクチャ構成図（`.drawio` / `.drawio.svg`）を格納しています。
アーキテクチャ決定記録（ADR）の英語正本は Open Knowledge Format (OKF) v0.3 バンドルとして [../../adr/index.md](../../adr/index.md) で管理し、日本語訳を `docs/jp/adr/` に配置しています。

## Light 構成（現在の注力対象）

![Light Architecture](../../architecture/light-architecture.drawio.svg)

- **編集可能な構成図:** [light-architecture.drawio](../../architecture/light-architecture.drawio)
- **ADR（日本語ミラー）:** [ADR-0001: Light 構成アーキテクチャ設計](../adr/0001-light-architecture.md)
- **概要:** 月額 `$10` 未満、Cloud Run v2（`min_instance_count = 0`, `asia-northeast1`）、Svelte 5 + SvelteKit 3 単一コンテナ（`adapter-bun`、distroless、`shadcn-svelte` `sidebar-07` / `login-03`）、`better-auth` Stateless Cookie + Google OAuth のみ（環境変数ベース Allowlist & E2E 切替対応）、Cloud Firestore Standard（永年無料枠）、Tauri デスクトップラッパー（OS ブラウザ + Deep Link OAuth）。

## Standard 構成（将来ロードマップ）

- [Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2) で管理：SvelteKit BFF + Rust API（`Connect RPC + Axum + sqlx + RLS`）+ PostgreSQL。
