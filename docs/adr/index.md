---
okf_version: "0.3"
title: "lean-cloud-app-template Architecture Decision Records"
description: "OKF v0.3 formatted Architecture Decision Records (ADRs) for lean-cloud-app-template covering GCP Light architecture, auth, datastore, and IaC decisions."
license: MIT
---

# Architecture Decision Records (ADRs)

* [ADR-0001: Light Architecture Design (GCP / <$10/month / Scale-to-Zero)](./0001-light-architecture.md) - Single-container Cloud Run v2, Svelte 5 + SvelteKit 3, Better Auth Stateless Cookie + Google OAuth, Firestore Standard, Tauri, and GCP Terraform IaC.

# Bundle & Supporting Files

* [Directory Update Log](./log.md) - Chronological history of ADR additions and updates.
* [ADR Authoring Guide](./README.md) - Human-facing guide and template for this repository's OKF v0.3 ADR customization.
* [ADR-0001 (Japanese Mirror)](../jp/adr/0001-light-architecture.md) - Synchronized Japanese translation outside the OKF bundle.
* [Light Architecture Diagram (SVG)](../architecture/light-architecture.drawio.svg) - Editable diagram source in [light-architecture.drawio](../architecture/light-architecture.drawio).
