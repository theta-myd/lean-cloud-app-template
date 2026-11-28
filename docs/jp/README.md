> 言語: [English](../../README.md) | **日本語**

# agent-ready-app-template

**AI コーディングエージェントがそのまま開発を始められる** Web & デスクトップアプリテンプレートです（**Svelte 5 + SvelteKit 3 + Tauri** ベース、**Light** 月額 $10 未満 / **Standard** Rust Connect RPC + PostgreSQL 18 RLS の 2 構成に対応）。毎回のアーキテクチャ設計や試行錯誤によるトークン消費を抑え、ビジネスロジックとカスタマイズに集中できます。

> **ステータス:** **Light 構成**（Cloud Run v2 + Cloud Firestore）および **Standard 構成**（Cloud Run v2 BFF + 内部専用 Rust Connect RPC API + Cloud SQL PostgreSQL 18 + Direct VPC Egress + Private Cloud DNS + RLS）の両方が実装済み・Google Cloud 実機にて E2E 検証済みです。`bun run init` により新規プロジェクトをいずれかの構成に特化できます。変更履歴は [CHANGELOG.md](../../CHANGELOG.md) を参照してください。

---

## コンセプト：なぜこのテンプレートを使うのか

AI コーディングエージェントにゼロからアプリを作らせると、**アーキテクチャ設計 → プロトタイプ作成 → 認証/セキュリティ修正 → IaC デバッグ** の手戻りループで大量のトークンと時間を消費しがちです。

**agent-ready-app-template** はこのムダをなくすために設計されています：

1. **ボイラープレートを省き、機能開発にトークンを集中:** Google OAuth、Allowlist 認可、セキュリティヘッダー（CSP/HSTS）、PostgreSQL RLS、distroless コンテナ、Terraform IaC、鍵なし WIF CI/CD まで実機検証済みの土台から開発を開始できます。
2. **AI エージェント前提のガードレール設計:** `AGENTS.md` / `GEMINI.md`、OKF v0.3 準拠の ADR（`docs/adr/`）、バンドル済み Svelte 5 / `shadcn-svelte` スキル（`web-app/app/.agents/skills/`）、3 層分離された BFF（`src/lib/server/`）により、エージェントが設計を崩さず安全に拡張・カスタマイズできます。
3. **Light / Standard を選んで、そのまま使う＆自由に改造:** まずは `bun run init` で **Light（月額 $10 未満・Scale-to-Zero）** または **Standard（Rust API + PostgreSQL 18 RLS）** を選び、要件に合うならそのまま利用しつつ、必要に応じて自由にカスタマイズできます。

---

## クイックスタート：構成の初期化（`bun run init`）

このテンプレートからリポジトリを作成した後、リポジトリルートで `bun run init` を実行すると **Light** または **Standard** にプロジェクトを特化できます：

```bash
# 対話モード（構成・アプリ名スラッグ・オプションを順に入力）
bun run init

# ファイルを変更せずに変更計画のみ確認（ドライラン）
bun run init -- --variant=standard --name=my-saas-app --dry-run

# Standard 構成で初期化（Light の Firestore BFF コードを削除し web-app/infra/gcp/standard/ を昇格）
bun run init -- --variant=standard --name=my-saas-app --yes

# Light 構成で初期化（Standard BFF・pg/ConnectRPC 依存・web-app/api/・proto/ を削除）
bun run init -- --variant=light --name=my-lean-app --yes

# Light 構成で初期化しつつ、参考例として web-app/api/ と proto/ を残す
bun run init -- --variant=light --keep-api --yes
```

`bun run init` による各構成の変換内容：

| 領域 | `--variant=light`（GCP） | `--variant=standard`（GCP） |
| --- | --- | --- |
| **BFF (`web-app/app/src/lib/server/`)** | `light/gcp/firestore.ts` を維持し `standard/` と `src/lib/gen/` を削除。`backend.ts` を Light 専用に固定 | `standard/`（Better Auth `auth` スキーマ接続＋Connect RPC クライアント）を維持し `light/` を削除（BFF からの直接データストア CRUD を完全除去）。`backend.ts` を Standard 専用に固定 |
| **依存パッケージ (`web-app/app/package.json`)** | `pg`, `@types/pg`, `@connectrpc/*`, `@bufbuild/*` を削除 | `@google-cloud/firestore` を削除 |
| **Rust API & Proto** | `web-app/api/`, `proto/`, `buf*.yaml`, `rust-api-ci.yml` を削除（`--keep-api` 指定時は残存） | 維持 |
| **ローカル Compose (`compose.yaml`)** | Firestore Emulator のみ | PostgreSQL 18 をデフォルト化（`docker compose up -d` で起動） |
| **Terraform (`web-app/infra/gcp/`)** | `light/` を `web-app/infra/gcp/` へ昇格 | `standard/` を `web-app/infra/gcp/` へ昇格 |
| **CI/CD (`.github/workflows/`)** | `deploy-gcp-standard.yml` を削除し `terraform-validate.yml` を単一化 | `deploy-gcp.yml` を削除し `terraform-validate.yml` を単一化 |
| **リネーム (`--name=<slug>`)** | パッケージ名、Tauri の `productName` / `identifier` / Deep Link スキーム、Terraform `service_name`、デプロイ既定値を一括更新 | 左記に加え `web-app/api/Cargo.toml` のクレート名も更新 |

> **マルチクラウド拡張性:** Standard 構成では `web-app -> BFF -> Rust API -> PostgreSQL` の構造は GCP / AWS / Azure いずれでも共通です（クラウド固有なのは `standard/gcp-id-token.ts` などのサービス間 IAM トークン取得のみ）。一方、Light 構成はクラウドごとの最適なマネージド構成に合わせて差し替えられます（GCP は `light/gcp/firestore.ts` の Stateless JWE Cookie + Firestore、将来の AWS では `light/aws/` として PostgreSQL DB セッション + Aurora DSQL を同じ `BackendAdapter` インターフェース配下に追加可能）。

---

## アーキテクチャ構成

### 1. Light 構成（標準デフォルト — 月額 $10 未満・Scale-to-Zero）

![Light Architecture](../architecture/gcp/light-architecture.drawio.svg)

- **コスト目標:** **月額 $10 未満**（小規模運用で **$0〜$5/月**、アイドル時は **$0/月**）。`min_instance_count = 0` とし、常時課金リソースを排除
- **Compute (`web-app/app`):** Cloud Run v2 単一コンテナ（`asia-northeast1`、`min_instance_count = 0`、1 vCPU / 512 MiB、`*.run.app`）上で Svelte 5 + SvelteKit 3（`adapter-bun`）＋ **distroless** イメージを稼働
- **UI:** `shadcn-svelte`（Home: `sidebar-07` / Login: `login-03`）＋ `mode-watcher`（`light` / `dark` / `system`）＋ `web-app/app/.agents/skills/` 配下に `shadcn-svelte` と公式 Svelte スキルを配置済み
- **認証:** `better-auth`（**Stateless Cookie モード**）＋ **Google OAuth 2.0 のみ**（`openid`, `email`, `profile`、$0）。環境変数ベースの Allowlist 認可と、E2E テスト専用のパスワードログイン切替（本番は `ENABLE_E2E_PASSWORD_AUTH=false` 固定）に対応
- **データストア:** **Cloud Firestore（Standard Edition, Native Mode）** を永年無料枠内で利用。Cloud Run ランタイム SA 経由のサーバーサイド専用アクセスとし、ローカル開発では `compose.yaml` で公式 Firestore Emulator を使用
- **Desktop (`desktop`):** `web-app/app` をラップする Tauri アプリ（Google OAuth は OS 標準ブラウザへ委譲し Deep Link で復帰）
- **Infra & 安全装置 (`web-app/infra/gcp/light`):** Terraform により Cloud Run v2、Firestore、Artifact Registry（Cleanup Policy 付き）、Secret Manager、Workload Identity Federation（OIDC）、Cloud Logging、Cloud Billing Budget アラート（`$5` / `$8` / `$10`）を構築
- **設計ドキュメント:** [gcp/light-architecture.drawio](../architecture/gcp/light-architecture.drawio) | [構成図 README](./architecture/README.md) | [ADR 一覧 (OKF v0.3 正本)](../adr/index.md) | [ADR-0001 (日本語)](./adr/0001-light-architecture.md)

### 2. Standard 構成（専用バックエンド API + PostgreSQL 18 RLS）

![Standard Architecture](../architecture/gcp/standard-architecture.drawio.svg)

専用のバックエンド API や PostgreSQL の Row-Level Security（RLS）が必要な案件向けの構成：

- **BFF (`web-app/app`):** Svelte 5 + SvelteKit 3。Better Auth は PostgreSQL の `auth` スキーマで DB セッション管理し、業務 CRUD はすべて `src/lib/server/standard/` 経由で短命 HS256 JWT（`x-app-user-token`）＋ GCP OIDC ID トークンを付与して内部 API へ委譲
- **Backend API (`web-app/api`):** Rust（`Connect RPC + Axum + sqlx + PostgreSQL 18 RLS`）、内部専用 Cloud Run v2（`INGRESS_TRAFFIC_INTERNAL_ONLY` + Cloud Run IAM）＋ `--migrate-only` の Cloud Run Job
- **Database:** Cloud SQL for PostgreSQL 18（Private IP 専用 + Direct VPC Egress `$0`。※Cloud SQL は Scale-to-Zero 非対応で最小構成でも約 $10〜$15+/月かかるため、月額 $10 未満を重視する場合は **Light** 構成を推奨）
- **Infra (`web-app/infra/gcp/standard`):** Terraform によりカスタム VPC + Private Services Access + Private Cloud DNS（`run.app.` → `private.googleapis.com`）、Cloud SQL for PostgreSQL 18（Private IP 専用）、Cloud Run v2（`app`・内部専用 `api`・`migrate` Job、Direct VPC Egress 経由）、最小権限 SA、Secret Manager、WIF（OIDC）、Cloud Billing Budget アラート（`$10` / `$15` / `$20`）を構築
- **設計ドキュメント:** [gcp/standard-architecture.drawio](../architecture/gcp/standard-architecture.drawio) | [構成図 README](./architecture/README.md) | [ADR-0002 (日本語)](./adr/0002-standard-architecture.md)
- **マルチクラウド展開:** 将来の `web-app/infra/aws`（AWS CDK、[#54](https://github.com/theta-myd/agent-ready-app-template/issues/54)）、`web-app/infra/azure`（Azure Bicep、[#55](https://github.com/theta-myd/agent-ready-app-template/issues/55)）

---

## ディレクトリ構成

```text
agent-ready-app-template/
├── .github/
│   ├── ISSUE_TEMPLATE/        # Bug / Feature Issue テンプレート（Issue のみ受付）
│   ├── workflows/             # CI（Web App / Rust API / Terraform 検証 / Gitleaks）& GCP デプロイ
│   ├── CONTRIBUTING.md
│   ├── dependabot.yml
│   └── release.yml
├── compose/
│   └── postgres/              # ローカル PostgreSQL 18 初期化スクリプト（auth/app スキーマ & RLS ロール）
├── docs/
│   ├── adr/                   # OKF v0.3 準拠 ADR（英語正本）
│   ├── architecture/          # .drawio / .drawio.svg アーキテクチャ図
│   └── jp/                    # 主要人間向けドキュメントの日本語ミラー
├── proto/                     # Buf v2 Protobuf 定義（TenantService, TodoService）
├── scripts/
│   ├── init.ts                # 構成切替スクリプト（`bun run init`）
│   └── init.test.ts           # `bun run init` の E2E 検証テスト（`bun run test:init`）
├── web-app/
│   ├── api/                   # Rust Connect RPC + Axum + sqlx + PostgreSQL 18 RLS API（Standard）
│   ├── app/                   # Svelte 5 + SvelteKit 3 (adapter-bun) + shadcn-svelte + better-auth
│   │   └── src/lib/server/    # 共通ファサード（backend.ts, auth.ts）+ light/gcp/ + standard/
│   └── infra/
│       ├── gcp/               # Terraform（light/ と standard/ のルートモジュール）
│       │   ├── light/         # Scale-to-Zero Cloud Run v2 + Firestore（月額 $10 未満）
│       │   └── standard/      # Cloud Run v2（app/api/migrate）+ VPC + Cloud SQL PG 18
│       ├── aws/               # 将来の AWS CDK 用プレースホルダ（#54）
│       └── azure/             # 将来の Azure Bicep 用プレースホルダ（#55）
├── desktop/                   # Tauri デスクトップラッパー
├── AGENTS.md                  # AI エージェント共通リポジトリルール・リリースポリシー
├── CHANGELOG.md               # 変更履歴（Keep a Changelog）
├── GEMINI.md                  # Antigravity / Gemini 用ルール（AGENTS.md を読込）
├── compose.yaml               # ローカル開発用 Firestore Emulator（既定）& PostgreSQL 18（standard プロファイル）
├── package.json               # ルートスクリプト（`bun run init`, `bun run test:init`）
├── .gitleaks.toml
├── .gitignore
├── LICENSE                    # MIT License
└── README.md
```

---

## ドキュメント言語ポリシー

- 本リポジトリの正本（Canonical）は **英語** です。
- 主要な人間向けドキュメント（`README.md`, `docs/adr/NNNN-*.md`, `docs/architecture/README.md`）のみ `docs/jp/` 配下に日本語ミラーを同期維持します。詳細は [AGENTS.md](../../AGENTS.md) および [GEMINI.md](../../GEMINI.md) を参照してください。

---

## セキュリティ & 秘密情報の取り扱い

本リポジトリは **Public テンプレート** です。実際の認証情報や環境固有のステートは絶対に含めないでください。

- コミット対象は `*.example`（`.env.example`, `terraform.tfvars.example`）のみとし、ダミー値（`CHANGE_ME` 等）を記載します。
- 実 `.env*`, `*.tfvars`, `*.tfstate*`, `*.pem`, `*.key`, サービスアカウント JSON 等は `.gitignore` で除外しています。
- CI から Google Cloud への認証は鍵ファイルを使わず **Workload Identity Federation（OIDC）** を利用します。
- `main` への全コミットは **Gitleaks**（`.github/workflows/secret-scan.yml`）でスキャンされます。

---

## Issue & ライセンス

- **フィードバック / バグ報告:** 用意された Issue テンプレートから起票してください（外部フォークからの PR は受け付けていません。詳細は [.github/CONTRIBUTING.md](../../.github/CONTRIBUTING.md)）。
- **ライセンス:** [MIT](../../LICENSE)
