output "cloud_run_url" {
  description = "Default HTTPS URL of the Cloud Run v2 service."
  value       = google_cloud_run_v2_service.app.uri
}

output "artifact_registry_repository_url" {
  description = "Docker repository URL in Artifact Registry."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "runtime_service_account_email" {
  description = "Cloud Run runtime service account email."
  value       = google_service_account.cloud_run_runtime.email
}

output "deployer_service_account_email" {
  description = "GitHub Actions deployer service account email (null if github_repository is unset)."
  value       = var.github_repository != "" ? google_service_account.github_deployer[0].email : null
}

output "workload_identity_provider_name" {
  description = "Workload Identity Provider resource name for google-github-actions/auth (null if github_repository is unset)."
  value       = var.github_repository != "" ? google_iam_workload_identity_pool_provider.github[0].name : null
}

output "secret_ids" {
  description = "Map of logical secret keys to Secret Manager secret IDs."
  value       = { for k, v in google_secret_manager_secret.app_secrets : k => v.secret_id }
}

output "firestore_database_name" {
  description = "Provisioned Firestore Native database name."
  value       = google_firestore_database.default.name
}
