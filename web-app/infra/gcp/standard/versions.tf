terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0"
    }
  }

  # Recommended for team/CI usage: create a GCS bucket with versioning enabled
  # and pass `-backend-config="bucket=<your-tfstate-bucket>"` during `terraform init`.
  #
  # backend "gcs" {
  #   prefix = "agent-ready-app/gcp/standard"
  # }
}
