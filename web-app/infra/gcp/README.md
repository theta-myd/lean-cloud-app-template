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
