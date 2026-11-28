# web-app/infra/gcp

Terraform Infrastructure as Code for Google Cloud (`asia-northeast1`), organized into two independent root modules by architecture variant:

| Variant | Directory | Primary Stack | Monthly Cost Target |
|---|---|---|---|
| **Light** (default) | [`./light/`](./light/README.md) | Single Cloud Run v2 (`min_instance_count = 0`) + Cloud Firestore (Native) + Artifact Registry + Secret Manager + WIF (OIDC) | `<$10/month` (scale-to-zero, idle `$0/month`) |
| **Standard** | [`./standard/`](./standard/README.md) | Cloud Run v2 (`app` public + `api` internal-only + `migrate` Job) + Custom VPC / Direct VPC Egress + Cloud SQL for PostgreSQL (Private IP only) + Artifact Registry + Secret Manager + WIF (OIDC) | `~$15–$20+/month` (Cloud SQL `db-f1-micro` Zonal minimum; no scale-to-zero on Cloud SQL) |

## Quick Links

- **Light setup & keyless CI/CD (WIF):** [light/README.md](./light/README.md)
- **Standard setup (Cloud SQL Private IP + Direct VPC Egress + DB roles + WIF):** [standard/README.md](./standard/README.md)
- **CI validation:** [`.github/workflows/terraform-validate.yml`](../../../.github/workflows/terraform-validate.yml) runs `terraform fmt -check -recursive`, `terraform init -backend=false`, and `terraform validate` on both `light/` and `standard/`.
