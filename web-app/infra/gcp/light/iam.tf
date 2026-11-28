resource "google_service_account" "cloud_run_runtime" {
  project      = var.project_id
  account_id   = "${var.service_name}-runtime"
  display_name = "Cloud Run Runtime (${var.service_name})"
  description  = "Least-privilege runtime service account for Cloud Run."

  depends_on = [google_project_service.enabled]
}

resource "google_project_iam_member" "runtime_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  count = var.github_repository != "" ? 1 : 0

  project                   = var.project_id
  workload_identity_pool_id = "${var.service_name}-github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "OIDC identity pool for GitHub Actions deployments."

  depends_on = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count = var.github_repository != "" ? 1 : 0

  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub Actions OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "github_deployer" {
  count = var.github_repository != "" ? 1 : 0

  project      = var.project_id
  account_id   = "${var.service_name}-deployer"
  display_name = "GitHub Actions Deployer (${var.service_name})"
  description  = "Keyless deployer service account assumed via Workload Identity Federation."

  depends_on = [google_project_service.enabled]
}

resource "google_service_account_iam_member" "github_wif_user" {
  count = var.github_repository != "" ? 1 : 0

  service_account_id = google_service_account.github_deployer[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository/${var.github_repository}"
}

resource "google_service_account_iam_member" "deployer_act_as_runtime" {
  count = var.github_repository != "" ? 1 : 0

  service_account_id = google_service_account.cloud_run_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deployer[0].email}"
}

resource "google_artifact_registry_repository_iam_member" "deployer_ar_writer" {
  count = var.github_repository != "" ? 1 : 0

  project    = var.project_id
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_deployer[0].email}"
}

resource "google_project_iam_member" "deployer_run_developer" {
  count = var.github_repository != "" ? 1 : 0

  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.github_deployer[0].email}"
}
