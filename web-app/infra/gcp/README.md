# web-app/infra/gcp

Terraform Infrastructure as Code for **Google Cloud** (primary target).

Planned components for the **Light** architecture (<$10/month, `min-instance = 0`):

- Cloud Run v2 service (`min_instance_count = 0`)
- Artifact Registry repository (container images)
- Secret Manager secrets (populated out-of-band or via secure CI, never hardcoded in Git)
- Workload Identity Federation (OIDC) for keyless GitHub Actions deployment
- Low-cost datastore provisioning / IAM bindings

Copy `terraform.tfvars.example` to `terraform.tfvars` locally (never commit `*.tfvars` or `*.tfstate`).
