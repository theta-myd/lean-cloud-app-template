# web-app/infra/gcp

Terraform Infrastructure as Code for the **Light** architecture on Google Cloud (`<$10/month`, `min_instance_count = 0`).

## Provisioned Resources

- **Cloud Run v2 (`cloud_run.tf`):** Single-container service in `asia-northeast1` (`min_instance_count = 0`, `cpu_idle = true`, 1 vCPU / 512 MiB, `*.run.app`)
- **Cloud Firestore (`firestore.tf`):** `(default)` database in `FIRESTORE_NATIVE` mode (Always Free daily tier)
- **Artifact Registry (`artifact_registry.tf`):** Docker repository with automated cleanup policies (deletes untagged >7d and tagged >30d while keeping the 3 most recent versions)
- **Secret Manager (`secrets.tf`):** Empty secret containers for `better-auth-secret`, `google-client-id`, and `google-client-secret` (no secret values stored in Git or Terraform state)
- **IAM & Workload Identity Federation (`iam.tf`):** Least-privilege Cloud Run runtime SA + optional keyless OIDC deployer SA for GitHub Actions
- **Billing Budget (`budget.tf`):** Optional monthly budget alert at 50% / 80% / 100% (`$5` / `$8` / `$10` for `$10` budget)

## Bootstrap Workflow (Two-Step Secret Mount)

Cloud Run v2 rejects referencing a Secret Manager secret before at least one secret version exists. Use the two-step flow below:

### 1. Copy variables & apply initial infrastructure (`enable_secret_env_refs = false`)

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your project_id (and optional github_repository / billing_account_id)

terraform init
terraform plan
terraform apply
```

### 2. Populate Secret Manager versions out-of-band

```bash
# Example using gcloud CLI (never commit these values)
printf '%s' 'REPLACE_WITH_32_BYTE_RANDOM_SECRET' | gcloud secrets versions add lean-cloud-app-better-auth-secret --data-file=-
printf '%s' 'REPLACE_WITH_GOOGLE_CLIENT_ID'      | gcloud secrets versions add lean-cloud-app-google-client-id --data-file=-
printf '%s' 'REPLACE_WITH_GOOGLE_CLIENT_SECRET'  | gcloud secrets versions add lean-cloud-app-google-client-secret --data-file=-
```

### 3. Enable Secret Manager mounts on Cloud Run

Set `enable_secret_env_refs = true` in `terraform.tfvars` and run:

```bash
terraform apply
```

## Remote State (Recommended for CI/CD)

Create a versioned GCS bucket out-of-band, uncomment the `backend "gcs"` block in `versions.tf`, and run:

```bash
terraform init -backend-config="bucket=YOUR_TFSTATE_BUCKET"
```

## Keyless CI/CD Deployment (GitHub Actions + WIF)

[`.github/workflows/deploy-gcp.yml`](../../../.github/workflows/deploy-gcp.yml) builds the distroless image from `web-app/app/Dockerfile`, pushes it to Artifact Registry, and deploys it to Cloud Run v2 using Workload Identity Federation (OIDC) with **zero static JSON service account keys**.

### 1. Provision WIF & Deployer IAM via Terraform

Set `github_repository = "<owner>/<repo>"` in `terraform.tfvars`, run `terraform apply`, and read the generated outputs:

```bash
terraform output workload_identity_provider_name
terraform output deployer_service_account_email
```

### 2. Configure GitHub Repository Variables

Add the following **Repository Variables** under **Settings → Secrets and variables → Actions → Variables** (no GitHub Secrets are required for GCP authentication):

| Variable | Required | Default | Source / Value |
|---|---|---|---|
| `GCP_PROJECT_ID` | Yes | — | Your Google Cloud Project ID (`var.project_id`) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Yes | — | `terraform output -raw workload_identity_provider_name` |
| `GCP_DEPLOYER_SERVICE_ACCOUNT` | Yes | — | `terraform output -raw deployer_service_account_email` |
| `GCP_REGION` | No | `asia-northeast1` | Matches `var.region` |
| `GCP_SERVICE_NAME` | No | `lean-cloud-app` | Matches `var.service_name` |
| `GCP_AR_REPOSITORY` | No | `GCP_SERVICE_NAME` | Artifact Registry repository ID (`var.service_name`) |

### 3. Triggers & Guardrails

- **Triggers:** Manual via `workflow_dispatch`, and automatically on pushes to `main` touching `web-app/app/**` or `.github/workflows/deploy-gcp.yml` **only when** the three required `GCP_*` repository variables are configured (unconfigured template forks skip automatic deploys cleanly).
- **Light cost & auth guardrails:** Deploys with `--min-instances=0 --cpu-throttling` (scale-to-zero) and enforces `ENABLE_E2E_PASSWORD_AUTH=false`, while preserving Terraform-managed `AUTH_ACCESS_MODE` (`allowlist` by default), `ALLOWED_EMAILS`, `ALLOWED_DOMAINS`, `GOOGLE_CLOUD_PROJECT`, Secret Manager mounts, and `allUsers` invoker IAM.
