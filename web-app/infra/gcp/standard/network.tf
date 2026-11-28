resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = "${var.service_name}-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.enabled]
}

resource "google_compute_subnetwork" "subnet" {
  project                  = var.project_id
  name                     = "${var.service_name}-subnet"
  region                   = var.region
  network                  = google_compute_network.vpc.id
  ip_cidr_range            = var.subnet_cidr
  private_ip_google_access = true
}

resource "google_compute_global_address" "private_ip_alloc" {
  project       = var.project_id
  name          = "${var.service_name}-psa-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
  deletion_policy         = var.psa_deletion_policy != "" ? var.psa_deletion_policy : null

  depends_on = [google_project_service.enabled]
}

# Route *.run.app lookups inside the VPC to Private Google Access VIPs
# (private.googleapis.com = 199.36.153.8/30) so Cloud Run Direct VPC Egress
# (`PRIVATE_RANGES_ONLY`) reaches the INGRESS_TRAFFIC_INTERNAL_ONLY Rust API
# without requiring Cloud NAT or an Internal Load Balancer.
resource "google_dns_managed_zone" "run_app_private" {
  project     = var.project_id
  name        = "${var.service_name}-run-app-private"
  dns_name    = "run.app."
  description = "Private DNS zone routing *.run.app to Private Google Access for internal Cloud Run calls."
  visibility  = "private"

  private_visibility_config {
    networks {
      network_url = google_compute_network.vpc.id
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_dns_record_set" "run_app_a" {
  project      = var.project_id
  managed_zone = google_dns_managed_zone.run_app_private.name
  name         = "run.app."
  type         = "A"
  ttl          = 300
  rrdatas      = ["199.36.153.8", "199.36.153.9", "199.36.153.10", "199.36.153.11"]
}

resource "google_dns_record_set" "run_app_wildcard_cname" {
  project      = var.project_id
  managed_zone = google_dns_managed_zone.run_app_private.name
  name         = "*.run.app."
  type         = "CNAME"
  ttl          = 300
  rrdatas      = ["run.app."]
}
