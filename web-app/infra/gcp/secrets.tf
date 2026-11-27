locals {
  app_secret_names = toset([
    "better-auth-secret",
    "google-client-id",
    "google-client-secret",
  ])
}

resource "google_secret_manager_secret" "app_secrets" {
  for_each = local.app_secret_names

  project   = var.project_id
  secret_id = "${var.service_name}-${each.value}"

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_iam_member" "runtime_accessor" {
  for_each = google_secret_manager_secret.app_secrets

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}
