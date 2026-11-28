> 言語: [English（正本 / OKF v0.3）](../../adr/0002-standard-architecture.md) | **日本語**

# ADR-0002: Standard 構成アーキテクチャ設計（GCP / Rust Connect RPC API + Cloud SQL PostgreSQL RLS）

- **ADR ID:** `ADR-0002` / **ステータス:** Proposed（OKF `draft`） / **作成日:** 2026-11-28
- **関連図:** [gcp/standard-architecture.drawio.svg](../../architecture/gcp/standard-architecture.drawio.svg)（編集可能ソース: [gcp/standard-architecture.drawio](../../architecture/gcp/standard-architecture.drawio)）
- **関連 ADR:** [ADR-0001: Light 構成アーキテクチャ設計](./0001-light-architecture.md)
- **ロードマップ / 実装先:** [Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2)（サブ Issue `#30`〜`#38`） / [compose.yaml](../../../compose.yaml) / [web-app/infra/gcp/](../../../web-app/infra/gcp/)

---

## 1. コンテキストと制約

[ADR-0001](./0001-light-architecture.md) で定義した **Light 構成**（月額 $10 未満・アイドル時 $0 付近）は、単一コンテナの Cloud Run、Cloud Firestore Standard、Better Auth Stateless Cookie により個人開発・小規模プロトタイプに最適化されている。一方、本格的なマルチテナント SaaS へ発展させる過程では、以下の要件が求められることが多い。

- **リレーショナルデータ設計と ACID トランザクション:** ドキュメント DB ではなく PostgreSQL による厳格なスキーマ・結合・整合性制御。
- **DB エンジン層でのマルチテナント分離:** アプリ側の `WHERE` 句任せにせず、PostgreSQL の行レベルセキュリティ（`ENABLE` + `FORCE ROW LEVEL SECURITY`）で他テナントへのアクセスを構造的に遮断。
- **端末単位の即時セッション失効:** Stateless Cookie の制約を解消し、PostgreSQL に永続化した DB セッションによる即時強制ログアウト。
- **型安全なバックエンド分離:** SvelteKit BFF（`web-app/app/`）の背後に、メモリ安全な Rust API サービス（`web-app/api/`）を配置し、Protobuf スキーマ駆動の **Connect RPC** で通信する（[Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2)）。

### Light 構成と Standard 構成の比較

| 観点 | Light 構成（[ADR-0001](./0001-light-architecture.md)） | Standard 構成（ADR-0002） |
| :--- | :--- | :--- |
| **想定月額コスト** | `$10 未満`（アイドル時 `$0` / 小規模 `$0〜$5`） | `約 $12〜$20`（アイドル時 `約 $10〜$12` / 小規模 `約 $12〜$20`） |
| **コンピュート構成** | Cloud Run v2 単一サービス（`app`） | Cloud Run v2 2 サービス（公開 `app` + 内部専用 `api`）+ 1 Job（`migrate`）、すべて `min_instance_count = 0` |
| **バックエンド / RPC** | SvelteKit BFF 内 TypeScript（`+page.server.ts`） | 専用 Rust バックエンド（`web-app/api/`、Connect RPC + Axum + `sqlx`）を BFF から呼び出し |
| **データストア** | Cloud Firestore Standard（日次無料枠） | Cloud SQL for PostgreSQL 18 Enterprise（`db-f1-micro` Zonal、PSA 経由 **Private IP 専用**） |
| **認証セッション** | Better Auth Stateless Cookie（DB Read 0 / 端末単位即時失効不可） | Better Auth PostgreSQL アダプタ（`auth` スキーマ、DB セッション + HttpOnly Cookie、端末単位即時失効可） |
| **マルチテナント分離** | アプリ層の Firestore パス分離 | 4 層多層防御の最終段として PostgreSQL `FORCE ROW LEVEL SECURITY`（`app_user` `NOBYPASSRLS`）を強制 |

### 主な制約

1. **低コスト固定費上限:** すべての Cloud Run コンピュートを `min_instance_count = 0` に維持し、Serverless VPC Access Connector（月額約 $14〜）ではなく **Direct VPC Egress（コンピュート費・同一リージョン内転送 $0）** を採用し、Cloud Load Balancing（月額約 $18〜）や Cloud NAT を排除することで、通常〜低トラフィック運用を **月額約 $12〜$20（アイドル時約 $10〜$12）** に収める。
2. **DB・内部 API のパブリック公開ゼロ:** Cloud SQL は **Public IP 無効**（`ipv4_enabled = false`）とし、`web-app/api` はパブリックインターネットからの直接到達（`INGRESS_TRAFFIC_INTERNAL_ONLY`）および未認証呼び出しを完全に拒否する。
3. **SvelteKit BFF ルーティング方針の維持:** データ取得・更新は原則 SvelteKit の `load()` およびフォーム `actions`（`+page.server.ts` / `+layout.server.ts`）から `web-app/api` を呼び出し、クライアントへ公開する独自の `+server.ts` プロキシを増やさない（`/api/health` と `/api/auth/*` のみ例外）。
4. **Public テンプレート安全性:** 実シークレット、`.env`、`*.tfvars`、サービスアカウント JSON 鍵をリポジトリ・CI に含めず、GitHub Actions は Workload Identity Federation（OIDC）のみで認証する。

---

## 2. 決定事項

| レイヤー | 採用技術 / サービス | 選定理由 |
| :--- | :--- | :--- |
| **Compute（`app` / `api` / `migrate`）** | **Cloud Run v2**（`asia-northeast1` Tier 1、`min_instance_count = 0`、リクエストベース課金）— 公開 `app`、内部専用 `api`、`migrate` Job | すべてのコンピュートが Scale-to-Zero に対応し、無料枠（月 200 万リクエスト / 18 万 vCPU 秒 / 36 万 GiB 秒）を共有。DDL マイグレーションを Cloud Run Job へ分離することでリクエスト処理リビジョンと疎結合化する。 |
| **ネットワーク / VPC 接続** | **カスタム VPC + サブネット + Private Services Access（PSA）** + **Cloud Run Direct VPC Egress**（`private-ranges-only`） | コネクタ VM 費・同一リージョン内転送費 **$0** で Cloud Run から Cloud SQL（Private IP）へ直接到達でき、Serverless VPC Access Connector や Cloud NAT を不要にする。 |
| **Web App / BFF** | **Svelte 5 + SvelteKit 3**（`adapter-bun`）+ **非 root distroless**（`web-app/app/`） | SSR・Better Auth・Connect RPC クライアント呼び出しを `load()` / `actions` で完結。`ARCHITECTURE_VARIANT=light` / `standard` の両モードを切り替え可能とする。 |
| **UI** | **shadcn-svelte**（Home: アクティブテナント切替付き `sidebar-07` / Login: `login-03`）+ `mode-watcher` | Light 構成の標準 UI 基盤を踏襲しつつ、`TenantService` と連動したテナント表示・切替 UI を追加する。 |
| **認証** | **Better Auth（PostgreSQL アダプタ）**（専用 `auth` スキーマ / `auth_user`）+ **Google OAuth 2.0 のみ**（`openid`, `email`, `profile`） | PostgreSQL（`auth.session`）の DB セッションと暗号化・署名済み HttpOnly Cookie を組み合わせ、端末単位の即時ログアウト・サーバー側強制失効を実現する。 |
| **バックエンド API** | **Rust**（`web-app/api/`）— **Connect RPC** + **Axum** + **`sqlx`** + **非 root distroless**（`proto/` 配下の Protobuf 定義を Buf で管理） | 標準 HTTP/2 上の型安全な JSON / Protobuf RPC、`sqlx` による型安全なクエリと組込マイグレーション、高速なコールドスタートと極小 distroless イメージを両立。 |
| **データベース** | **Cloud SQL for PostgreSQL 18**（Enterprise エディション、`db-f1-micro`、Zonal、10 GB SSD、**Private IP 専用** `ipv4_enabled = false`、自動バックアップ） | ネイティブ RLS と自動バックアップを備えた最小コストのマネージド PostgreSQL。Public IPv4 課金と外部公開面を完全に排除する。 |
| **Desktop** | **Tauri**（`desktop/`、`web-app/app` ラッパー） | ADR-0001 と同一設計。WebView の `disallowed_useragent` 制限を回避するため、OS 標準ブラウザで Google OAuth 認証し Deep Link でコールバックする。 |
| **Ingress** | `app` は **Cloud Run 標準 HTTPS URL（`*.run.app`）**、`api` は **`INGRESS_TRAFFIC_INTERNAL_ONLY`** | Cloud Load Balancing の固定費（月額約 $18〜）を回避しつつ、`api` を外部インターネットから完全遮断する。独自ドメインや CDN は将来任意で Firebase Hosting を前段追加可能。 |
| **Registry** | **Artifact Registry** + Cleanup Policy | `app` / `api` の distroless イメージを保管し、Cleanup Policy で最新 2〜3 世代のみ保持して無料枠（0.5 GiB）内〜最小課金に抑える。 |
| **シークレット** | **Secret Manager**（2 段階 Terraform ブートストラップ） | `better-auth-secret`, `google-client-id`, `google-client-secret`, `internal-api-jwt-secret`, `auth-database-url`, `api-database-url`, `migrator-database-url` を安全に管理する。 |
| **CI/CD** | **GitHub Actions + Workload Identity Federation（OIDC）** | 鍵ファイルなしでビルド・Push・`migrate` Cloud Run Job 実行・`api` / `app` デプロイまで自動化。 |
| **監視 / 安全装置** | **Cloud Logging / Monitoring**（`tracing` 構造化 JSON ログ）+ **Cloud Billing Budget**（`$10` / `$15` / `$20`） | ログ無料枠（50 GiB/月）を活用しつつ、50%（`$10`）/ 75%（`$15`）/ 100%（`$20`）の 3 段階予算アラートで意図しない課金を早期検知する。 |

---

## 3. 月額コスト試算と予算超過リスク

Light 構成と異なり、**Cloud SQL for PostgreSQL はネイティブの Scale-to-Zero に非対応**であるため、インスタンス稼働中は一定のベースライン固定費が発生する。

### 想定月額コスト（`asia-northeast1`）

| サービス | 構成 / 無料枠（概要） | アイドル時 | 小規模運用時 |
| :--- | :--- | :--- | :--- |
| Cloud SQL for PostgreSQL（`db-f1-micro` / Zonal） | Enterprise エディション共有コア稼働費（730 時間/月で約 `$7.67`） | 約 $7.67 | 約 $7.67 |
| Cloud SQL ストレージ・バックアップ | 10 GB SSD（約 `$2.00/月`）+ 自動バックアップ（約 `$0〜$0.80/月`、Private IP `$0`） | 約 $2.00〜$2.80 | 約 $2.00〜$3.50 |
| Cloud Run v2（`app` / `api` / `migrate` Job） | `min_instance_count = 0`、無料枠（200 万 req / 18 万 vCPU 秒 / 36 万 GiB 秒） | $0 | $0〜$2.50 |
| Direct VPC Egress / Private Services Access | コネクタ VM なし、同一リージョン内 VPC 転送 `$0` | $0 | $0 |
| Artifact Registry | 無料枠 0.5 GiB（Cleanup Policy で最新 3 世代保持前提） | $0 | $0〜$0.20 |
| Secret Manager | 6 バージョンまで無料、超過 1 バージョンあたり `$0.06/月`（計 7 シークレットで 1 バージョン分課金）+ 月 1 万アクセス無料 | 約 $0.06 | 約 $0.06 |
| Cloud Logging | 50 GiB / 月 無料枠 | $0 | $0 |
| **合計** | — | **約 $10〜$12 / 月** | **約 $12〜$20 / 月** |

### 主な予算超過リスクと対策

- **Cloud SQL の常時稼働コスト:** トラフィックがゼロでも稼働中の `db-f1-micro` には月額約 `$10〜$12` が発生する。
  - **利用しない期間の停止（開発・検証環境）:** `gcloud sql instances patch <instance-name> --activation-policy=NEVER` でコンピュート課金を停止できる（ストレージの約 `$2/月` のみ継続）。再開時は `--activation-policy=ALWAYS` を指定する。
  - **使い捨て環境の削除:** 検証完了後は `terraform destroy` で一括削除する（後述の `db_deletion_protection` および `psa_deletion_policy` を参照）。
- **誤った HA（`REGIONAL`）化・Public IP 有効化・スペック引き上げ:** `REGIONAL` 化するとコンピュート・ストレージ費が約 2 倍になり、`ipv4_enabled = true` は未使用 IPv4 課金と攻撃面拡大を招く。Terraform の既定値で `availability_type = "ZONAL"`、`tier = "db-f1-micro"`、`ipv4_enabled = false` を固定する。
- **Serverless VPC Access Connector / Cloud NAT の誤導入:** 旧来の VPC Connector（月額約 `$14〜`）や Cloud NAT（月額約 `$32〜` + 転送費）を追加すると `$20/月` 上限を超過する。Direct VPC Egress を `vpc_egress = "PRIVATE_RANGES_ONLY"` に設定し、Google OAuth 等の外部通信は Cloud Run 標準経路へ逃がす。
- **ストレージ自動拡張・Artifact Registry 肥大化:** Cloud SQL に `disk_autoresize_limit`（例: `20` GB）の上限を設け、Artifact Registry には Cleanup Policy（untagged 7 日 / tagged 30 日削除 + 最新 3 世代保持）を強制する。
- **予算アラート:** Cloud Billing Budget（既定 `budget_amount_usd = 20`）により `$10`（50%）、`$15`（75%）、`$20`（100%）で通知する。

---

## 4. 4 層セキュリティ・テナント RLS 設計

ネットワーク設定ミス・クライアント改ざん・SQL の `WHERE` 句漏れといった単一障害点では他テナントのデータが漏洩しないよう、Standard 構成では **4 層の独立した多層防御** を実装する。

```text
Browser / Tauri
  │  HTTPS（Better Auth HttpOnly セッション Cookie）
  ▼
[Cloud Run: web-app/app（SvelteKit BFF、公開 HTTPS）]
  │  1. PostgreSQL `auth` スキーマでセッション検証（`auth_user`）
  │  2. Metadata Server から Google OIDC ID Token 取得（Authorization: Bearer）
  │  3. 短命 HMAC-SHA256 JWT を署名（`x-app-user-token`: sub, email, tid）
  │  4. Direct VPC Egress（private-ranges-only）経由で `web-app/api` を呼出
  ▼
[Cloud Run: web-app/api（Rust Connect RPC / Axum、INTERNAL_ONLY + IAM）]
  │  Layer 1: 外部インターネットからの直接通信を拒否（INGRESS_TRAFFIC_INTERNAL_ONLY）
  │  Layer 2: Google OIDC ID Token を検証（`roles/run.invoker` は `app-runtime` SA のみ）
  │  Layer 3: `x-app-user-token` 署名検証 + `app.tenant_memberships` で所属確認
  │  Layer 4: トランザクション開始 -> `SELECT set_config('app.current_tenant_id', $1, true)`
  ▼
[Cloud SQL for PostgreSQL（PSA 経由 Private IP 専用）]
  └─ `app` スキーマへ `app_user`（`NOSUPERUSER NOBYPASSRLS`）で接続し、
     全テナント対象テーブルで `ENABLE` & `FORCE ROW LEVEL SECURITY` を強制
```

### Layer 1: ネットワーク境界（内部通信・DB の完全プライベート化）

- **`web-app/api` の内部専用 Ingress:** `ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"` を強制し、パブリックインターネットからの直接アクセスを Google Front End 段階で遮断する。
- **Cloud SQL の Private IP 専用化:** `ipv4_enabled = false` とし、パブリック IPv4 アドレスを一切付与しない。カスタム VPC 内の **Private Services Access（PSA）** ピアリング経由でのみ到達可能とする。
- **Direct VPC Egress（`PRIVATE_RANGES_ONLY`）:** `app`、`api`、`migrate` Job にアタッチし、プライベート IP 帯域（RFC 1918）への通信のみ VPC 経由で `$0` 転送しつつ、Google OAuth 等の外部通信には Cloud NAT を不要とする。

### Layer 2: サービス間 IAM 認証（Google OIDC）

- **厳格な Cloud Run IAM 制御:** `web-app/api` は未認証アクセスを禁止（`--no-allow-unauthenticated`、`allUsers` 付与なし）とする。
- **最小権限の呼び出し元限定:** `web-app/api` に対する `roles/run.invoker` は専用の `app-runtime` サービスアカウントのみに付与する。
- **OIDC ID Token の伝搬:** SvelteKit BFF は Cloud Run メタデータサーバーから `audience = <API_BASE_URL>` の Google OIDC ID Token を取得・キャッシュし、`Authorization: Bearer <id_token>` ヘッダへ付与する（ローカル開発時は自動的にスキップ）。
- **サービスアカウントの責務分離:**
  - `app-runtime`: `api` への `roles/run.invoker` および `app` 用シークレットの `secretAccessor` のみ。
  - `api-runtime`: `api` 用シークレットの `secretAccessor` のみ。
  - `migrator`: `migrator-database-url` の `secretAccessor` のみ。
  - `github-deployer`（WIF / OIDC）: 対象リポジトリの Artifact Registry 書き込み、Cloud Run デプロイ、ランタイム／マイグレータ SA への `iam.serviceAccountUser` のみ。

### Layer 3: 署名付きユーザーアサーションとテナント所属検証

`Authorization: Bearer` ヘッダは Cloud Run のサービス間 IAM 認証（Google OIDC ID Token）に専有されるため、エンドユーザー識別情報は独立した署名ヘッダで伝搬する。

- **短命署名付き JWT（`x-app-user-token`）:** SvelteKit BFF は `auth.session` でセッション検証後、Secret Manager で `app` と `api` に共有した `INTERNAL_API_JWT_SECRET` を用いて短命（例: TTL 60 秒）の **HMAC-SHA256** JWT を署名し、`x-app-user-token` へ付与する。クレームには `sub`（Better Auth の `user.id`）、`email`、任意の `tid`（要求アクティブ `tenant_id`）、`iat` / `exp` を含める。
- **Rust API（`web-app/api`）ミドルウェア検証:**
  1. HMAC-SHA256 署名と有効期限（`exp`）を検証し、欠落・改ざん・期限切れは `Unauthenticated` で拒否する。
  2. PostgreSQL の `app.tenant_memberships (user_id, tenant_id, role)` に対して（最小スコープの `SECURITY DEFINER` ヘルパー等を介して）`(user_id, tenant_id)` の所属を実 DB で照合し、未所属テナントの `tid` なりすましを `PermissionDenied` で遮断する。
- **個人テナントの自動ブートストラップ:** 初回ログイン時など所属テナントがまだ存在しない場合（または `TenantService.EnsurePersonalTenant` 呼び出し時）、`web-app/api` が `app.tenants` に個人用テナントを作成し、`app.tenant_memberships` へ `role = 'owner'` を原子的に登録する。

### Layer 4: PostgreSQL スキーマ・ロール分離と Row-Level Security（RLS）

単一の Cloud SQL PostgreSQL データベース内を 2 つの独立スキーマと 3 つの最小権限ロールに厳格分離する。

| PostgreSQL ロール | 利用元 | 権限範囲 | RLS バイパス |
| :--- | :--- | :--- | :--- |
| `migrator` | Cloud Run Job（`migrate` / `sqlx`） | `app`（および必要に応じ初期 `auth`）の DDL・所有者権限 | 所有者（ランタイムでは一切不使用） |
| `auth_user` | `web-app/app`（Better Auth） | `auth.*` への DML（`SELECT/INSERT/UPDATE/DELETE`）のみ、**`app.*` へのアクセス権なし** | `NOSUPERUSER NOBYPASSRLS` |
| `app_user` | `web-app/api`（Rust `sqlx`） | `app.*` への DML（`SELECT/INSERT/UPDATE/DELETE`）のみ、**`auth.*` へのアクセス権なし** | `NOSUPERUSER NOBYPASSRLS` |

- **専用 `auth` スキーマ（`auth_user`）:** Better Auth テーブル（`user`, `session`, `account`, `verification`）を業務データから完全隔離する。DB セッション＋HttpOnly Cookie により、Light 構成の課題だった端末単位の即時ログアウト・セッション失効を実現する。
- **テナント分離 `app` スキーマ（`app_user` + `FORCE ROW LEVEL SECURITY`）:**
  - テナントに紐づくすべてのテーブル（`app.todos`, `app.tenants`, `app.tenant_memberships` 等）に対し、`ENABLE ROW LEVEL SECURITY` と `FORCE ROW LEVEL SECURITY` の両方を有効化する。
  - RLS ポリシーはフェイルクローズ式で記述する。
    ```sql
    USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
    ```
    `app.current_tenant_id` が未設定または空文字の場合、`nullif(..., '')` が `NULL` となり全行が不一致となる（フェイルクローズ: 0 件返却・更新不可）。
  - **トランザクションローカルなテナント設定（コネクションプール安全）:** `sqlx` のコネクションプール経由で他リクエストへ設定値が漏洩しないよう、Rust API ミドルウェアはリクエストごとにトランザクションを開始し以下を実行する。
    ```sql
    SELECT set_config('app.current_tenant_id', $1, true);
    ```
    第 3 引数 `is_local = true` により、`COMMIT` または `ROLLBACK` 時に PostgreSQL が確実に変数をクリアする。
  - **自動結合テストによる検証:** `app_user`（`NOBYPASSRLS`）接続で実行する Rust 結合テストにて、テナント A がテナント B の行を閲覧・更新・削除できないこと、および `app.current_tenant_id` 未設定時に 0 件になることを明示的に検証する。

---

## 5. 認可制御・E2E テスト認証・ローカル開発設計

### 5.1 特定ユーザー限定アクセス（Allowlist 認可）

[ADR-0001](./0001-light-architecture.md) と同様に、限定公開／招待制アプリ向けの環境変数ベース Allowlist 認可を既定値として継承する。

- **環境変数:**
  - `AUTH_ACCESS_MODE`: `allowlist`（テンプレート既定値）または `open`
  - `ALLOWED_EMAILS`: カンマ区切りの許可メールアドレス一覧
  - `ALLOWED_DOMAINS`: カンマ区切りの許可ドメイン一覧（Google Workspace ドメイン単位許可など）
- **実装ポイント:** Better Auth の OAuth コールバックフックおよび SvelteKit `hooks.server.ts` の両方で `email` と `emailVerified === true` を検証する。Standard 構成はすでに PostgreSQL を持つため、将来アプリ内の管理画面から動的に招待管理したい場合も PostgreSQL テーブル参照へ自然に拡張できる。

### 5.2 E2E テスト用 Email / Password ログイン（環境変数切替）

Playwright 等の E2E テストで Google 本番 OAuth を自動化せずに正規の認証フローを検証するため、環境変数で制御するテスト用ログイン経路を維持する。

- **環境変数:**
  - `ENABLE_E2E_PASSWORD_AUTH="false"`（**本番 Cloud Run では必ず `"false"` 固定**、Terraform 側で強制）
  - `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`（ローカル／CI の E2E 実行時のみ設定）
- **設計:**
  - **UI（`login-03`）:** `ENABLE_E2E_PASSWORD_AUTH=true` のときのみ Email / Password フォームを表示し、本番（`false`）では Google ログインボタンのみ表示する。
  - **バックエンド（Better Auth）:** Standard モードかつ `true` の場合はローカル／CI の PostgreSQL `auth` スキーマに対して `emailAndPassword` を有効化してテストユーザーを 1 件シードし、DB セッション Cookie 発行・`x-app-user-token` 署名・Connect RPC・PostgreSQL RLS まで一気通貫で検証する。

### 5.3 ローカル開発（PostgreSQL 18 Compose プロファイル）

ルートの [compose.yaml](../../../compose.yaml) において、Light 構成の Firestore Emulator 開発体験を壊さずに Standard 構成のローカル PostgreSQL 18 環境を共存させる。

- **Docker Compose（`standard` プロファイル）:** `docker compose --profile standard up -d` で PostgreSQL 18 コンテナを起動する（従来の `docker compose up -d` は Light 用の Firestore Emulator のみを起動）。Windows の `wslc`（`compose` サブコマンドなし）環境では、初期化 SQL ディレクトリをマウントした単発 `wslc run` コマンドを提供する。
- **初期化 SQL ブートストラップ:** `/docker-entrypoint-initdb.d/` により、`auth` / `app` スキーマおよび最小権限ロール（`auth_user`、`app_user` `NOSUPERUSER NOBYPASSRLS`、`migrator`）を本番 Cloud SQL と同一構造で自動作成する。
- **本番同等のローカル検証:** ローカルで `web-app/app`（`ARCHITECTURE_VARIANT=standard`）から `web-app/api`・PostgreSQL へ接続する場合、バイパスするのは GCP メタデータサーバーからの OIDC ID Token 取得（Layer 2）のみであり、Better Auth DB セッション・`x-app-user-token` 署名検証（Layer 3）・PostgreSQL `FORCE ROW LEVEL SECURITY`（Layer 4）は本番と同一ロジックで動作する。

---

## 6. Terraform 構成と運用（`web-app/infra/gcp/`）

Light 構成と Standard 構成の IaC を独立管理し、CI での並行検証および将来の `bun run init` 切替（[Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2)、Issue `#35`、Issue `#37`）に対応するため、[web-app/infra/gcp/](../../../web-app/infra/gcp/) 配下を以下の 2 つのルートモジュールへ整理する。

- **`web-app/infra/gcp/light/`** — 既存の Light 構成（[ADR-0001](./0001-light-architecture.md): 単一 Cloud Run v2 + Cloud Firestore Standard）。
- **`web-app/infra/gcp/standard/`** — Standard 構成の Terraform スタック:
  - `versions.tf` / `providers.tf` — Terraform / `hashicorp/google` プロバイダ定義（GCS Remote State ガイド付き）。
  - `variables.tf` / `terraform.tfvars.example` — `project_id`, `region`（`asia-northeast1`）, `db_tier`（`db-f1-micro`）, `budget_amount_usd`（`20`）, `enable_secret_env_refs`, `auth_access_mode`（`allowlist`）, `db_deletion_protection`（本番既定 `true`、使い捨て検証時は `false`）, `psa_deletion_policy`（`terraform destroy` 時の GCP PSA ピアリング解放待ちを回避する `"ABANDON"` 設定に対応）。
  - `apis.tf` — `run`, `sqladmin`, `compute`, `servicenetworking`, `artifactregistry`, `secretmanager`, `iam`, `iamcredentials`, `cloudresourcemanager`（および任意で `billingbudgets`）の有効化。
  - `network.tf` — カスタム VPC、サブネット（`asia-northeast1`）、PSA 予約 IP 範囲、`google_service_networking_connection`（`var.psa_deletion_policy` 連携）。
  - `cloud_sql.tf` — Cloud SQL for PostgreSQL 18 Enterprise（`db-f1-micro`, `availability_type = "ZONAL"`, `ipv4_enabled = false`, Private IP 専用, 自動バックアップ, `deletion_protection = var.db_deletion_protection`）。
  - `cloud_run.tf` — Cloud Run v2 `app` サービス（公開 HTTPS、Direct VPC Egress `PRIVATE_RANGES_ONLY`、`min_instance_count = 0`、`ENABLE_E2E_PASSWORD_AUTH = "false"` 固定）、内部専用 `api` サービス（`INGRESS_TRAFFIC_INTERNAL_ONLY`、IAM 認証必須、Direct VPC Egress `PRIVATE_RANGES_ONLY`、`min_instance_count = 0`）、および `migrate` Cloud Run v2 Job（Direct VPC Egress 経由の `sqlx` マイグレーション）。
  - `iam.tf` — 最小権限分離された SA 群（`api` のみへの `roles/run.invoker` を持つ `app-runtime`、`api-runtime`、`migrator`）および GitHub Actions 用 WIF Pool / Provider + Deployer SA。
  - `secrets.tf` — 全 7 シークレット（`better-auth-secret`, `google-client-id`, `google-client-secret`, `internal-api-jwt-secret`, `auth-database-url`, `api-database-url`, `migrator-database-url`）の 2 段階ブートストラップ（`enable_secret_env_refs = false` → バージョン登録 → `true`）。
  - `artifact_registry.tf` — Docker リポジトリ＋Cleanup Policy（untagged 7 日 / tagged 30 日削除 + 最新 `artifact_keep_count` 世代保持）。
  - `budget.tf` — 任意の Cloud Billing Budget（50% / 75% / 100% 閾値 → `$10` / `$15` / `$20`）。
  - `outputs.tf` — `app` URL、`api` 内部 URL、Cloud SQL Private IP、WIF Provider 名、Artifact Registry URL、`migrate` Job 名等。

他クラウドの Standard 構成 IaC（`web-app/infra/aws/` AWS CDK および `web-app/infra/azure/` Azure Bicep）は引き続き [Issue #2](https://github.com/theta-myd/lean-cloud-app-template/issues/2) の将来フェーズとして管理する。
