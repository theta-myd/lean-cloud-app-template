resource "google_artifact_registry_repository" "app" {
  project                = var.project_id
  location               = var.region
  repository_id          = var.service_name
  description            = "Container images for ${var.service_name} (kept lean for Always Free 0.5 GiB tier)."
  format                 = "DOCKER"
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "delete-untagged-7d"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }

  cleanup_policies {
    id     = "delete-tagged-30d"
    action = "DELETE"

    condition {
      tag_state  = "TAGGED"
      older_than = "2592000s"
    }
  }

  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"

    most_recent_versions {
      keep_count = var.artifact_keep_count
    }
  }

  depends_on = [google_project_service.enabled]
}
