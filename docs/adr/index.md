---
okf_version: "0.3"
title: "agent-ready-app-template Architecture Decision Records"
description: "OKF v0.3 formatted Architecture Decision Records (ADRs) for agent-ready-app-template covering GCP Light and Standard architectures, auth, datastore, RLS, and IaC decisions."
license: MIT
---

# Architecture Decision Records (ADRs)

* [ADR-0001: Light Architecture Design (GCP / <$10/month / Scale-to-Zero)](./0001-light-architecture.md) - Single-container Cloud Run v2, Svelte 5 + SvelteKit 3, Better Auth Stateless Cookie + Google OAuth, Firestore Standard, Tauri, and GCP Terraform IaC.
* [ADR-0002: Standard Architecture Design (GCP / Rust Connect RPC API + Cloud SQL PostgreSQL RLS)](./0002-standard-architecture.md) - Multi-service Cloud Run v2 (`app` + internal `api` + `migrate` Job) with Direct VPC Egress, Rust Connect RPC + Axum + `sqlx`, Better Auth PostgreSQL DB sessions, Cloud SQL PostgreSQL (Private IP only), 4-layer security & tenant RLS, and `light/` vs `standard/` Terraform IaC.

# Bundle & Supporting Files

* [Directory Update Log](./log.md) - Chronological history of ADR additions and updates.
* [ADR Authoring Guide](./README.md) - Human-facing guide and template for this repository's OKF v0.3 ADR customization.
* [ADR-0001 (Japanese Mirror)](../jp/adr/0001-light-architecture.md) - Synchronized Japanese translation outside the OKF bundle.
* [ADR-0002 (Japanese Mirror)](../jp/adr/0002-standard-architecture.md) - Synchronized Japanese translation outside the OKF bundle.
* [Light Architecture Diagram (GCP / SVG)](../architecture/gcp/light-architecture.drawio.svg) - Editable diagram source in [gcp/light-architecture.drawio](../architecture/gcp/light-architecture.drawio).
* [Standard Architecture Diagram (GCP / SVG)](../architecture/gcp/standard-architecture.drawio.svg) - Editable diagram source in [gcp/standard-architecture.drawio](../architecture/gcp/standard-architecture.drawio).
