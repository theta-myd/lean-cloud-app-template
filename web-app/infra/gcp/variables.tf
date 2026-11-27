variable "project_id" {
  description = "Google Cloud Project ID."
  type        = string
}

variable "region" {
  description = "Google Cloud region for Cloud Run, Artifact Registry, and Firestore (Tier 1 default)."
  type        = string
  default     = "asia-northeast1"
}

variable "service_name" {
  description = "Base name for Cloud Run service, Artifact Registry repository, and service accounts."
  type        = string
  default     = "lean-cloud-app"
}

variable "container_image" {
  description = "Initial container image for Cloud Run bootstrap before CI/CD deploys the app image."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "cpu_limit" {
  description = "CPU limit for the Cloud Run container."
  type        = string
  default     = "1000m"
}

variable "memory_limit" {
  description = "Memory limit for the Cloud Run container."
  type        = string
  default     = "512Mi"
}

variable "max_instance_count" {
  description = "Maximum number of Cloud Run instances (min_instance_count is fixed to 0 for scale-to-zero)."
  type        = number
  default     = 3
}

variable "artifact_keep_count" {
  description = "Number of most recent container image versions to retain in Artifact Registry."
  type        = number
  default     = 3
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated HTTP invocations on Cloud Run (required for public web apps handling auth in-app)."
  type        = bool
  default     = true
}

variable "enable_secret_env_refs" {
  description = "Mount Secret Manager secrets into Cloud Run. Set true after adding at least one secret version."
  type        = bool
  default     = false
}

variable "auth_access_mode" {
  description = "Application access control mode ('allowlist' or 'open')."
  type        = string
  default     = "allowlist"

  validation {
    condition     = contains(["open", "allowlist"], var.auth_access_mode)
    error_message = "auth_access_mode must be either 'open' or 'allowlist'."
  }
}

variable "allowed_emails" {
  description = "Comma-separated list of allowed Google account emails when auth_access_mode = 'allowlist'."
  type        = string
  default     = ""
}

variable "allowed_domains" {
  description = "Comma-separated list of allowed Google Workspace / email domains when auth_access_mode = 'allowlist'."
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "Optional 'owner/repo' string to provision keyless Workload Identity Federation (OIDC) for GitHub Actions."
  type        = string
  default     = ""
}

variable "billing_account_id" {
  description = "Optional Google Cloud Billing Account ID (XXXXXX-XXXXXX-XXXXXX) to create monthly budget alerts."
  type        = string
  default     = ""
}

variable "budget_amount_usd" {
  description = "Monthly budget threshold in USD for Cloud Billing Budget alerts."
  type        = number
  default     = 10
}
