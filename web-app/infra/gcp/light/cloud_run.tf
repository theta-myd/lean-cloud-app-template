locals {
  secret_env_map = var.enable_secret_env_refs ? {
    BETTER_AUTH_SECRET   = google_secret_manager_secret.app_secrets["better-auth-secret"].secret_id
    GOOGLE_CLIENT_ID     = google_secret_manager_secret.app_secrets["google-client-id"].secret_id
    GOOGLE_CLIENT_SECRET = google_secret_manager_secret.app_secrets["google-client-secret"].secret_id
  } : {}
}

resource "google_cloud_run_v2_service" "app" {
  project             = var.project_id
  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.cloud_run_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instance_count
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "AUTH_ACCESS_MODE"
        value = var.auth_access_mode
      }

      env {
        name  = "ALLOWED_EMAILS"
        value = var.allowed_emails
      }

      env {
        name  = "ALLOWED_DOMAINS"
        value = var.allowed_domains
      }

      env {
        name  = "ENABLE_E2E_PASSWORD_AUTH"
        value = "false"
      }

      dynamic "env" {
        for_each = var.app_url != "" ? {
          PUBLIC_APP_URL  = var.app_url
          BETTER_AUTH_URL = var.app_url
        } : {}

        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.secret_env_map

        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.enabled,
    google_secret_manager_secret_iam_member.runtime_accessor,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = google_cloud_run_v2_service.app.project
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
