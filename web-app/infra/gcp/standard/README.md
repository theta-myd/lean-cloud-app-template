# web-app/infra/gcp/standard

Terraform Infrastructure as Code for the **Standard** multi-service architecture on Google Cloud (`asia-northeast1`): public SvelteKit `app`, internal-only Rust `api`, `migrate` Job, and Private-IP-only Cloud SQL for PostgreSQL connected via **Direct VPC Egress**.

> **Cost note:** Cloud Run services run with `min_instance_count = 0` (scale-to-zero) and Direct VPC Egress adds `$0` connector overhead, while Cloud SQL (`db-f1-micro`, Zonal) does not scale to zero (`~$10–$15+/month` minimum). If you want `<$10/month` scale-to-zero, use [`../light/`](../light/README.md).

## Provisioned Resources

- **VPC & Private Services Access (`network.tf`):** Custom VPC (`auto_create_subnetworks = false`), regional subnet (`10.10.0.0/24`, Private Google Access enabled), `/16` internal allocation, and PSA peering (`servicenetworking.googleapis.com`)
- **Cloud SQL for PostgreSQL (`cloud_sql.tf`):** `POSTGRES_18` Enterprise (`db-f1-micro`, `ZONAL`, `PD_SSD` 10 GiB with autoresize, automated daily backups, `ipv4_enabled = false` — **Private IP only**) + application database (`app`)
- **Cloud Run v2 (`cloud_run.tf`):**
  - `app`: Public HTTPS (`INGRESS_TRAFFIC_ALL`), `min_instance_count = 0`, Direct VPC Egress (`PRIVATE_RANGES_ONLY`), `ARCHITECTURE_VARIANT=standard`, `ENABLE_E2E_PASSWORD_AUTH=false`
  - `api`: Internal-only (`INGRESS_TRAFFIC_INTERNAL_ONLY`), `min_instance_count = 0`, Direct VPC Egress (`PRIVATE_RANGES_ONLY`), **no `allUsers` binding** (`roles/run.invoker` granted exclusively to `app-runtime` SA)
  - `migrate` Job: Runs the API image with `--migrate-only` via Direct VPC Egress using the dedicated `migrator` SA
- **IAM & Workload Identity Federation (`iam.tf`):** Three least-privilege runtime service accounts (`app-runtime`, `api-runtime`, `migrator`) + optional keyless GitHub Actions OIDC deployer SA (`roles/artifactregistry.writer`, `roles/run.developer`, and `roles/iam.serviceAccountUser` on all three runtime SAs)
- **Secret Manager (`secrets.tf`):** Seven empty secret containers with strict per-SA least-privilege `roles/secretmanager.secretAccessor` bindings (zero secret values in Git or Terraform state):
  - `app-runtime`: `better-auth-secret`, `google-client-id`, `google-client-secret`, `internal-api-jwt-secret`, `auth-database-url`
  - `api-runtime`: `internal-api-jwt-secret`, `api-database-url`
  - `migrator`: `migrator-database-url`
- **Artifact Registry (`artifact_registry.tf`):** Docker repository with cleanup policies (deletes untagged >7d and tagged >30d while keeping the 6 most recent versions by default — 3 per service)
- **Billing Budget (`budget.tf`):** Optional monthly budget alert at 50% / 75% / 100% (`$10` / `$15` / `$20` at default `$20`)

## Bootstrap Workflow (Two-Step Secret Mount + DB Role Setup)

Cloud Run v2 rejects referencing a Secret Manager secret before at least one secret version exists. Use the workflow below:

### 1. Copy variables & apply initial infrastructure (`enable_secret_env_refs = false`)

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your project_id (and optional github_repository / billing_account_id)

terraform init
terraform plan
terraform apply
```

Capture the key outputs:

```bash
APP_URL=$(terraform output -raw app_cloud_run_url)
SQL_PRIVATE_IP=$(terraform output -raw cloud_sql_private_ip)
SQL_INSTANCE=$(terraform output -raw cloud_sql_instance_name)
```

Register `${APP_URL}/api/auth/callback/google` as an Authorized Redirect URI in your Google OAuth 2.0 Web Client.

### 2. Create least-privilege PostgreSQL roles & populate Secret Manager versions out-of-band

Because Cloud SQL has **no Public IP**, create the three least-privilege PostgreSQL roles (`auth_user`, `api_user`, `migrator_user`) via Cloud SQL Auth Proxy / IAP bastion or `gcloud sql users create` + an initial SQL grant script so each runtime connects with its own credentials (with `NOBYPASSRLS` enforced for `api_user` to guarantee Row-Level Security):

```bash
# Example: create database users via gcloud (replace passwords with strong generated values)
gcloud sql users create migrator_user --instance="${SQL_INSTANCE}" --password='REPLACE_WITH_MIGRATOR_PASSWORD'
gcloud sql users create auth_user     --instance="${SQL_INSTANCE}" --password='REPLACE_WITH_AUTH_PASSWORD'
gcloud sql users create api_user      --instance="${SQL_INSTANCE}" --password='REPLACE_WITH_API_PASSWORD'
```

Then populate all seven Secret Manager versions out-of-band (never commit real secrets or store them in `terraform.tfvars`):

```bash
printf '%s' 'REPLACE_WITH_32_BYTE_RANDOM_SECRET' | gcloud secrets versions add lean-cloud-app-better-auth-secret --data-file=-
printf '%s' 'REPLACE_WITH_GOOGLE_CLIENT_ID'      | gcloud secrets versions add lean-cloud-app-google-client-id --data-file=-
printf '%s' 'REPLACE_WITH_GOOGLE_CLIENT_SECRET'  | gcloud secrets versions add lean-cloud-app-google-client-secret --data-file=-
printf '%s' 'REPLACE_WITH_INTERNAL_JWT_SECRET'   | gcloud secrets versions add lean-cloud-app-internal-api-jwt-secret --data-file=-

printf '%s' "postgres://auth_user:REPLACE_WITH_AUTH_PASSWORD@${SQL_PRIVATE_IP}:5432/app?sslmode=require"         | gcloud secrets versions add lean-cloud-app-auth-database-url --data-file=-
printf '%s' "postgres://api_user:REPLACE_WITH_API_PASSWORD@${SQL_PRIVATE_IP}:5432/app?sslmode=require"           | gcloud secrets versions add lean-cloud-app-api-database-url --data-file=-
printf '%s' "postgres://migrator_user:REPLACE_WITH_MIGRATOR_PASSWORD@${SQL_PRIVATE_IP}:5432/app?sslmode=require" | gcloud secrets versions add lean-cloud-app-migrator-database-url --data-file=-
```

### 3. Enable Secret Manager mounts & app URL on Cloud Run

Set `app_url = "<app_cloud_run_url>"` and `enable_secret_env_refs = true` (and `db_deletion_protection = true` for production) in `terraform.tfvars`, then apply:

```bash
terraform apply
```

### 4. Execute Database Migrations

Once the API container image is pushed to Artifact Registry and deployed to the `migrate` Job, run:

```bash
gcloud run jobs execute "$(terraform output -raw migrate_job_name)" --region=asia-northeast1 --wait
```

## Keyless CI/CD (GitHub Actions + WIF)

Set `github_repository = "<owner>/<repo>"` in `terraform.tfvars`, run `terraform apply`, and read:

```bash
terraform output workload_identity_provider_name
terraform output deployer_service_account_email
```

The provisioned deployer SA holds `roles/artifactregistry.writer`, `roles/run.developer`, and `roles/iam.serviceAccountUser` on all three runtime service accounts (`app-runtime`, `api-runtime`, `migrator`) with **zero static JSON keys**.

## Remote State (Recommended for CI/CD)

Create a versioned GCS bucket out-of-band, uncomment the `backend "gcs"` block in `versions.tf`, and run:

```bash
terraform init -backend-config="bucket=YOUR_TFSTATE_BUCKET"
```

## Teardown (`terraform destroy`) Notes

- **`psa_deletion_policy` (default `"ABANDON"`):** Google Cloud's Service Networking peering often remains marked "in use" for several minutes after Cloud SQL deletion, causing `terraform destroy` to time out. Leaving `psa_deletion_policy = "ABANDON"` detaches the peering cleanly from Terraform state in disposable environments. Set `psa_deletion_policy = ""` when you want Terraform to attempt full peering removal.
- **`db_deletion_protection` (default `false`):** Defaults to `false` for disposable template verification. Set `db_deletion_protection = true` for production environments, and reset it to `false` via `terraform apply` before destroying.
