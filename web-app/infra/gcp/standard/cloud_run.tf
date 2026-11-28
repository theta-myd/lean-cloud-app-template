locals {
  api_secret_env_map = var.enable_secret_env_refs ? {
    INTERNAL_API_JWT_SECRET = google_secret_manager_secret.secrets["internal-api-jwt-secret"].secret_id
    DATABASE_URL            = google_secret_manager_secret.secrets["api-database-url"].secret_id
  } : {}

  app_secret_env_map = var.enable_secret_env_refs ? {
    BETTER_AUTH_SECRET      = google_secret_manager_secret.secrets["better-auth-secret"].secret_id
    GOOGLE_CLIENT_ID        = google_secret_manager_secret.secrets["google-client-id"].secret_id
    GOOGLE_CLIENT_SECRET    = google_secret_manager_secret.secrets["google-client-secret"].secret_id
    INTERNAL_API_JWT_SECRET = google_secret_manager_secret.secrets["internal-api-jwt-secret"].secret_id
    AUTH_DATABASE_URL       = google_secret_manager_secret.secrets["auth-database-url"].secret_id
  } : {}

  migrator_secret_env_map = var.enable_secret_env_refs ? {
    DATABASE_URL = google_secret_manager_secret.secrets["migrator-database-url"].secret_id
  } : {}
}

resource "google_cloud_run_v2_service" "api" {
  project             = var.project_id
  name                = "${var.service_name}-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false

  template {
    service_account = google_service_account.api_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instance_count
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.subnet.id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.api_container_image

      resources {
        limits = {
          cpu    = var.api_cpu_limit
          memory = var.api_memory_limit
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "RUST_LOG"
        value = "info"
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      dynamic "env" {
        for_each = local.api_secret_env_map

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
    google_secret_manager_secret_iam_member.api_runtime_accessor,
    google_service_networking_connection.private_vpc_connection,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "api_invoker_from_app" {
  project  = google_cloud_run_v2_service.api.project
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.app_runtime.email}"
}

resource "google_cloud_run_v2_service" "app" {
  project             = var.project_id
  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.app_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instance_count
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.subnet.id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.app_container_image

      resources {
        limits = {
          cpu    = var.app_cpu_limit
          memory = var.app_memory_limit
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "ARCHITECTURE_VARIANT"
        value = "standard"
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "API_BASE_URL"
        value = google_cloud_run_v2_service.api.uri
      }

      env {
        name  = "API_AUDIENCE"
        value = google_cloud_run_v2_service.api.uri
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
        for_each = local.app_secret_env_map

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
    google_secret_manager_secret_iam_member.app_runtime_accessor,
    google_service_networking_connection.private_vpc_connection,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "app_public_invoker" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = google_cloud_run_v2_service.app.project
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_job" "migrate" {
  project             = var.project_id
  name                = "${var.service_name}-migrate"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.migrator.email
      max_retries     = 0

      vpc_access {
        network_interfaces {
          network    = google_compute_network.vpc.id
          subnetwork = google_compute_subnetwork.subnet.id
        }
        egress = "PRIVATE_RANGES_ONLY"
      }

      containers {
        image = var.api_container_image
        args  = ["--migrate-only"]

        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi"
          }
        }

        dynamic "env" {
          for_each = local.migrator_secret_env_map

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
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.enabled,
    google_secret_manager_secret_iam_member.migrator_accessor,
    google_service_networking_connection.private_vpc_connection,
  ]
}
