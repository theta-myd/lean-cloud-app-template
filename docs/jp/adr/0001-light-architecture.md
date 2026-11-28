> 言語: [English（正本 / OKF v0.3）](../../adr/0001-light-architecture.md) | **日本語**

# ADR-0001: Light 構成アーキテクチャ設計（GCP / <$10/month / Scale-to-Zero）

- **ADR ID:** `ADR-0001` / **ステータス:** Accepted（OKF `stable`） / **決定日:** 2026-11-27
- **関連図:** [gcp/light-architecture.drawio.svg](../../architecture/gcp/light-architecture.drawio.svg)（編集可能ソース: [gcp/light-architecture.drawio](../../architecture/gcp/light-architecture.drawio)）
- **実装先:** [web-app/infra/gcp/](../../../web-app/infra/gcp/) / [compose.yaml](../../../compose.yaml) / [web-app/app/.env.example](../../../web-app/app/.env.example)

---

## 1. コンテキストと制約

個人開発・スモールスタート向けの Web / Desktop アプリテンプレートとして、以下の制約を満たす初期アーキテクチャ（**Light 構成**）を定義する。

1. **コスト上限:** 通常〜低トラフィック運用で **月額 $10 未満（アイドル時は $0 付近）** に収める。
2. **Scale-to-Zero 徹底:** 常時稼働インスタンス（Cloud SQL、Cloud Load Balancing 等）を排除し、`min_instance_count = 0` で運用する。
3. **モノレポ保守性:** 単一コンテナ構成で開始しつつ、将来の **Standard 構成**（Rust API + PostgreSQL + RLS、[Issue #2](https://github.com/theta-myd/agent-ready-app-template/issues/2)）へ拡張可能なディレクトリ構造を維持する。
4. **Public テンプレート安全性:** 実シークレットやサービスアカウント鍵（JSON）をリポジトリ・CI ともに持たない。

---

## 2. 決定事項

| レイヤー | 採用技術 / サービス | 選定理由 |
| :--- | :--- | :--- |
| **Compute** | **Cloud Run v2**（単一コンテナ、`asia-northeast1` Tier 1、`min_instance_count = 0`、1 vCPU / 512 MiB、リクエストベース課金） | Scale-to-Zero 対応。無料枠（月 200 万リクエスト / 18 万 vCPU 秒 / 36 万 GiB 秒）が広い。 |
| **Web App / BFF** | **Svelte 5 + SvelteKit 3**（`adapter-bun`）+ **distroless** | 単一コンテナで SSR・BFF・認証を完結。distroless 非 root 実行でイメージサイズと攻撃面を最小化。 |
| **UI** | **shadcn-svelte**（Home: `sidebar-07` / Login: `login-03`） | 折りたたみアイコン付きダッシュボードとログイン画面を標準ブロックベースで構築。 |
| **認証** | **Better Auth（Stateless Cookie モード）** + **Google OAuth 2.0 のみ**（`openid`, `email`, `profile`） | Better Auth（MIT OSS）＋ Google OAuth 基本スコープはいずれも無料。Stateless 暗号化 HttpOnly Cookie により、セッション検証ごとの DB 読み取りをゼロ化。 |
| **Desktop** | **Tauri**（`web-app/app` ラッパー） | Google は組込 WebView 内の OAuth をブロック（`disallowed_useragent`）するため、OS 標準ブラウザで認証しカスタム URL スキーム（Deep Link）でセッションを戻す設計とする。 |
| **データストア** | **Cloud Firestore（Standard Edition, Native Mode）**（`asia-northeast1`） | 永年無料枠（1 GiB / 日次 50,000 Read / 20,000 Write / 20,000 Delete）内で運用可能。Cloud Run ランタイム SA（ADC）経由でサーバーサイド専用アクセスとし、クライアントへ直接公開しない。 |
| **Ingress** | **Cloud Run 標準 HTTPS URL（`*.run.app`）** | Cloud Load Balancing は固定費（月額約 $18〜）が発生し予算を超過するため不採用。独自ドメインや CDN が必要になった場合は、任意オプションとして **Firebase Hosting**（無料枠あり）を前段に追加する。 |
| **Registry** | **Artifact Registry** + Cleanup Policy | distroless イメージを保管し、Cleanup Policy で最新 2〜3 世代のみ保持して無料枠（0.5 GiB）内に収める。 |
| **シークレット** | **Secret Manager** | `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 等を格納（無料枠: 6 アクティブバージョン / 月 10,000 アクセス）。 |
| **CI/CD** | **GitHub Actions + Workload Identity Federation（OIDC）** | 鍵ファイルを発行せず短命トークンでデプロイ。 |
| **監視 / 安全装置** | **Cloud Logging / Monitoring** + **Cloud Billing Budget** | ログ無料枠（50 GiB/月）を活用しつつ、`$5` / `$8` / `$10` の 3 段階で予算アラートを通知する。 |

---

## 3. 月額コスト試算と予算超過リスク

### 想定月額コスト

| サービス | 無料枠（概要） | アイドル時 | 小規模運用時 |
| :--- | :--- | :--- | :--- |
| Cloud Run v2 | 200万 req / 18万 vCPU秒 / 36万 GiB秒（請求アカウント単位） | $0 | $0〜$2 |
| Cloud Firestore (Standard) | 1 GiB / 日次 5万 R / 2万 W / 2万 D（1 DB/プロジェクト） | $0 | $0〜$2 |
| Artifact Registry | 0.5 GiB（請求アカウント単位） | $0 | $0（Cleanup Policy 前提） |
| Secret Manager | 6 バージョン / 1万アクセス | $0 | $0 |
| Cloud Logging | 50 GiB / 月 | $0 | $0 |
| **合計** | — | **$0 / 月** | **$0〜$5 / 月** |

### 主な予算超過リスクと対策
- **Artifact Registry の肥大化:** イメージが蓄積すると 0.5 GiB を超えて課金されるため、Terraform 側で Cleanup Policy（直近 3 世代保持 + untagged 7日 / tagged 30日削除）を必須化する。
- **Cloud Run のアウトバウンド転送・コールドスタート多発:** 大容量静的アセットの配信が増えた場合は、前段に Firebase Hosting（CDN）または Cloud Storage を検討する。
- **Firestore の無制限クエリ:** セッション確認を Stateless Cookie に逃がしているため通常読み取りは少ないが、一覧取得には必ずページネーション（`limit`）を実装する。

---

## 4. セキュリティ設計とトレードオフ

1. **Better Auth Stateless Cookie のトレードオフ**
   - **利点:** セッション検証で Firestore Read を消費しない（コストゼロ・低レイテンシ）。
   - **制約:** サーバー側 DB にセッションレコードを持たないため、特定端末の即時強制ログアウトや管理者による一括セッション失効は行えない。
   - **緩和策:** セッション Cookie の有効期限（`expiresIn`）を短め〜適正値（例: 7 日）に設定し、`BETTER_AUTH_SECRET` は Secret Manager で管理する（ローテーションで全セッション失効が可能）。将来、即時失効やマルチデバイス管理・Email/Password が必要になった場合は DB 永続化へ移行する。
2. **Firestore アクセス境界**
   - Firestore Security Rules はデフォルト全拒否とし、SvelteKit BFF（`server.ts`）のみが Cloud Run ランタイムサービスアカウント（最小権限 IAM ロール）でアクセスする。
3. **IAM 最小権限分離**
   - **GitHub Actions Deploy 用 SA（WIF/OIDC）:** Artifact Registry への Push と Cloud Run デプロイ権限のみ。
   - **Cloud Run Runtime 用 SA:** Firestore 読み書きと指定シークレットの `secretAccessor` 権限のみ。

---

## 5. 認可制御・E2E テスト認証・ローカル開発設計

### 5.1 特定ユーザー限定アクセス（Allowlist 認可）
Google OAuth 2.0 のみを維持したまま、利用者を特定ユーザー／組織に限定するため、環境変数ベースの Allowlist 認可を標準搭載する。

- **環境変数:**
  - `AUTH_ACCESS_MODE`: `open`（全 Google アカウント許可）または `allowlist`（許可リスト一致のみ許可、テンプレート既定値）
  - `ALLOWED_EMAILS`: カンマ区切りの許可メールアドレス一覧
  - `ALLOWED_DOMAINS`: カンマ区切りの許可ドメイン一覧（例: Google Workspace ドメイン単位許可）
- **実装ポイント:**
  - Google OAuth コールバック時（Better Auth フック）および SvelteKit `hooks.server.ts` の両方で `email` と `emailVerified === true` を検証する。
  - Allowlist を環境変数（または Secret Manager）で持つため **Firestore Read は 0 回** のまま維持できる。将来、管理画面から動的にユーザー招待・管理を行うアプリへ発展させる場合は、Firestore の `allowed_users` コレクション参照へ差し替える。
  - 個人・限定グループ向け運用の場合は、Google Cloud Console 側の OAuth 同意画面を「テスト（最大 100 名のテストユーザー）」または「内部（Google Workspace 限定）」に設定する運用も第 1 防衛線として併用できる。

### 5.2 E2E テスト用 Email / Password ログイン（環境変数切替）
Playwright 等による E2E テストでは Google 本番 OAuth フローの自動化が困難なため、環境変数でオン／オフできるテスト用ログイン経路を用意する。

- **環境変数:**
  - `ENABLE_E2E_PASSWORD_AUTH=false`（本番 Cloud Run では必ず `false` 固定）
  - `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`（ローカル／CI E2E 実行時のみ設定）
- **設計:**
  - **UI（`login-03`）:** `ENABLE_E2E_PASSWORD_AUTH=true` の場合のみ Email / Password フォームを表示し、`false` では Google ログインボタンのみを表示する。
  - **バックエンド（Better Auth）:** 本番（`false`）では完全 Stateless Cookie モードで動作させ、`true` のときだけ Bun 標準内蔵のインメモリ SQLite（`bun:sqlite` の `:memory:`）を Better Auth の `database` へ渡して `emailAndPassword` を有効化し、起動時にテストユーザーを 1 件シードする。追加パッケージや永続 DB なしで正規の Better Auth セッション Cookie を発行できる。

### 5.3 ローカル開発（Firestore Emulator）
ローカル開発時は Google Cloud 公式の Firestore Emulator コンテナを使用し、実 GCP 課金・ネットワーク依存なしで開発する。

- **ルート `compose.yaml` / コンテナ起動コマンド:** 公式イメージ `gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators` を用い、`gcloud emulators firestore start --host-port=0.0.0.0:8080` を起動する（Docker では `docker compose up -d`、Windows の `wslc` には `compose` サブコマンドがないため `wslc run -d --rm --name firestore-emulator -p 8080:8080 gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators gcloud emulators firestore start --host-port=0.0.0.0:8080` を使用）。
- **SDK 接続:** アプリ側に `FIRESTORE_EMULATOR_HOST=localhost:8080` を設定するだけで、`@google-cloud/firestore` が自動的にエミュレータへ接続するため、本番とローカルでアプリコードを分岐させる必要がない。

---

## 6. Terraform リソース構成（`web-app/infra/gcp/`）

[web-app/infra/gcp/](../../../web-app/infra/gcp/) に以下のリソースを実装済みです。

- `versions.tf` / `providers.tf` — Terraform / `hashicorp/google` プロバイダ定義（Remote State 対応ガイド付き）
- `variables.tf` / `terraform.tfvars.example` — `project_id`, `region`（`asia-northeast1`）, `service_name`, `budget_amount_usd`（`10`）, `github_repository`, `auth_access_mode` 等
- `apis.tf` — 必要 API の有効化（`run.googleapis.com`, `firestore.googleapis.com`, `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`, `iam.googleapis.com`, `iamcredentials.googleapis.com`, `cloudresourcemanager.googleapis.com`, 任意で `billingbudgets.googleapis.com`）
- `iam.tf` — Cloud Run ランタイム SA、GitHub Actions 用 Workload Identity Pool / Provider + Deploy SA
- `artifact_registry.tf` — Docker リポジトリ＋Cleanup Policy（untagged 7日 / tagged 30日削除 + 最新 `artifact_keep_count` 世代保持）
- `secrets.tf` — Secret Manager シークレット枠作成（2 段階ブートストラップ、値は Git 管理外で登録）
- `firestore.tf` — Firestore Standard（`FIRESTORE_NATIVE`）データベース
- `cloud_run.tf` — Cloud Run v2 サービス（`min_instance_count = 0`, 1 vCPU / 512 MiB, 非 root distroless 前提, `ENABLE_E2E_PASSWORD_AUTH = "false"` 固定）
- `budget.tf` — Cloud Billing Budget（50% / 80% / 100% 閾値アラート、任意で有効化）
- `outputs.tf` — Cloud Run URL、WIF Provider 名、Artifact Registry URL 等
