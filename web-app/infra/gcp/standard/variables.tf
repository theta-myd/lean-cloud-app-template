variable "project_id" {
  description = "Google Cloud Project ID."
  type        = string
}

variable "region" {
  description = "Google Cloud region for VPC subnet, Cloud SQL, Cloud Run, and Artifact Registry."
  type        = string
  default     = "asia-northeast1"
}

variable "service_name" {
  description = "Base name for Cloud Run services, VPC, Cloud SQL, Artifact Registry, and service accounts (max 18 chars so '-app-runtime' fits within the 30-char SA limit)."
  type        = string
  default     = "lean-cloud-app"

  validation {
    condition     = length(var.service_name) >= 3 && length(var.service_name) <= 18
    error_message = "service_name must be between 3 and 18 characters."
  }
}

variable "subnet_cidr" {
  description = "Primary IPv4 CIDR range for the regional VPC subnet used by Direct VPC Egress."
  type        = string
  default     = "10.10.0.0/24"
}

variable "psa_deletion_policy" {
  description = "Deletion policy for the Private Services Access peering connection ('ABANDON' prevents terraform destroy hangs in disposable environments; '' attempts clean peering removal)."
  type        = string
  default     = "ABANDON"

  validation {
    condition     = contains(["ABANDON", ""], var.psa_deletion_policy)
    error_message = "psa_deletion_policy must be either 'ABANDON' or '' (empty string for clean removal)."
  }
}

variable "db_version" {
  description = "Cloud SQL PostgreSQL major version."
  type        = string
  default     = "POSTGRES_17"
}

variable "db_tier" {
  description = "Cloud SQL machine tier (Enterprise edition; db-f1-micro is the lowest-cost starting tier)."
  type        = string
  default     = "db-f1-micro"
}

variable "db_availability_type" {
  description = "Cloud SQL availability type ('ZONAL' for lean cost, or 'REGIONAL' for high availability)."
  type        = string
  default     = "ZONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.db_availability_type)
    error_message = "db_availability_type must be either 'ZONAL' or 'REGIONAL'."
  }
}

variable "db_disk_size_gb" {
  description = "Initial Cloud SQL SSD storage size in GiB (autoresize is enabled)."
  type        = number
  default     = 10
}

variable "db_name" {
  description = "Application PostgreSQL database name created on the Cloud SQL instance."
  type        = string
  default     = "app"
}

variable "db_deletion_protection" {
  description = "Enable Terraform deletion protection on Cloud SQL. Defaults to false for disposable verification; set true in production."
  type        = bool
  default     = false
}

variable "app_container_image" {
  description = "Initial container image for the public SvelteKit web-app Cloud Run service before CI/CD deploys the app image."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "api_container_image" {
  description = "Initial container image for the internal Rust API Cloud Run service and migrate Job before CI/CD deploys the api image."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "app_cpu_limit" {
  description = "CPU limit for the public web-app Cloud Run container."
  type        = string
  default     = "1000m"
}

variable "app_memory_limit" {
  description = "Memory limit for the public web-app Cloud Run container."
  type        = string
  default     = "512Mi"
}

variable "api_cpu_limit" {
  description = "CPU limit for the internal Rust API Cloud Run container."
  type        = string
  default     = "1000m"
}

variable "api_memory_limit" {
  description = "Memory limit for the internal Rust API Cloud Run container."
  type        = string
  default     = "512Mi"
}

variable "max_instance_count" {
  description = "Maximum number of instances per Cloud Run service (min_instance_count is fixed to 0 for scale-to-zero)."
  type        = number
  default     = 3
}

variable "artifact_keep_count" {
  description = "Number of most recent container image versions to retain in Artifact Registry (default 6 = 3 per service for app + api)."
  type        = number
  default     = 6
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated HTTP invocations on the public web-app Cloud Run service (api remains internal + IAM-protected)."
  type        = bool
  default     = true
}

variable "enable_secret_env_refs" {
  description = "Mount Secret Manager secrets into Cloud Run services and migrate Job. Set true after adding at least one version to every secret."
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

variable "app_url" {
  description = "Public HTTPS base URL of the app (e.g. Cloud Run *.run.app URL or custom domain). Sets PUBLIC_APP_URL and BETTER_AUTH_URL."
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
  description = "Monthly budget threshold in USD for Cloud Billing Budget alerts ($10 / $15 / $20 at default 20)."
  type        = number
  default     = 20
}
