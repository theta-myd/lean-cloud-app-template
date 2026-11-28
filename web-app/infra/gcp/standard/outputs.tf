output "app_cloud_run_url" {
  description = "Default HTTPS URL of the public web-app Cloud Run v2 service."
  value       = google_cloud_run_v2_service.app.uri
}

output "api_cloud_run_url" {
  description = "Internal HTTPS URL of the private Rust API Cloud Run v2 service."
  value       = google_cloud_run_v2_service.api.uri
}

output "migrate_job_name" {
  description = "Name of the Cloud Run v2 Job used to run sqlx database migrations."
  value       = google_cloud_run_v2_job.migrate.name
}

output "cloud_sql_instance_name" {
  description = "Cloud SQL for PostgreSQL instance name."
  value       = google_sql_database_instance.postgres.name
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name (project:region:instance)."
  value       = google_sql_database_instance.postgres.connection_name
}

output "cloud_sql_private_ip" {
  description = "Private IPv4 address of the Cloud SQL for PostgreSQL instance."
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "cloud_sql_database_name" {
  description = "Provisioned PostgreSQL database name."
  value       = google_sql_database.app.name
}

output "vpc_network_id" {
  description = "Custom VPC network ID."
  value       = google_compute_network.vpc.id
}

output "vpc_subnet_id" {
  description = "Regional VPC subnet ID used by Cloud Run Direct VPC Egress."
  value       = google_compute_subnetwork.subnet.id
}

output "artifact_registry_repository_url" {
  description = "Docker repository URL in Artifact Registry."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "app_runtime_service_account_email" {
  description = "Cloud Run web-app runtime service account email."
  value       = google_service_account.app_runtime.email
}

output "api_runtime_service_account_email" {
  description = "Cloud Run Rust API runtime service account email."
  value       = google_service_account.api_runtime.email
}

output "migrator_service_account_email" {
  description = "Cloud Run migration Job service account email."
  value       = google_service_account.migrator.email
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
  value       = { for k, v in google_secret_manager_secret.secrets : k => v.secret_id }
}
