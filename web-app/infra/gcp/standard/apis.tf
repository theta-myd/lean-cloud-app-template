locals {
  core_apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "compute.googleapis.com",
    "dns.googleapis.com",
    "servicenetworking.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ]
  optional_apis = var.billing_account_id != "" ? ["billingbudgets.googleapis.com"] : []
}

resource "google_project_service" "enabled" {
  for_each = toset(concat(local.core_apis, local.optional_apis))

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
