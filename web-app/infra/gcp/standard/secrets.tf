locals {
  all_secret_names = toset([
    "better-auth-secret",
    "google-client-id",
    "google-client-secret",
    "internal-api-jwt-secret",
    "auth-database-url",
    "api-database-url",
    "migrator-database-url",
  ])

  app_runtime_secret_names = toset([
    "better-auth-secret",
    "google-client-id",
    "google-client-secret",
    "internal-api-jwt-secret",
    "auth-database-url",
  ])

  api_runtime_secret_names = toset([
    "internal-api-jwt-secret",
    "api-database-url",
  ])

  migrator_secret_names = toset([
    "migrator-database-url",
  ])
}

resource "google_secret_manager_secret" "secrets" {
  for_each = local.all_secret_names

  project   = var.project_id
  secret_id = "${var.service_name}-${each.value}"

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_iam_member" "app_runtime_accessor" {
  for_each = local.app_runtime_secret_names

  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "api_runtime_accessor" {
  for_each = local.api_runtime_secret_names

  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "migrator_accessor" {
  for_each = local.migrator_secret_names

  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migrator.email}"
}
