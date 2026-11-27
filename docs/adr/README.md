# Architecture Decision Records (OKF v0.3)

This directory is an **Open Knowledge Format (OKF) v0.3** knowledge bundle ([specification](https://github.com/open-knowledge-format/open-knowledge-format)) customized for Architecture Decision Records (ADRs).

> **Note:** This `README.md` intentionally omits a `type` YAML frontmatter field so OKF v0.3 consumers treat it as non-concept human guidance and skip it cleanly (OKF SPEC §3.2).

---

## 1. Directory Conventions

- **`index.md`**: Bundle root declaration (`okf_version: "0.3"`) and ADR listing.
- **`log.md`**: Chronological update log (no frontmatter, newest-first `## YYYY-MM-DD` headings).
- **`NNNN-<slug>.md`**: Individual ADR concept documents in canonical English (e.g., `0001-light-architecture.md`).
- **Japanese mirrors:** Maintained separately under [`../jp/adr/`](../jp/adr/) so `docs/adr/` stays free of duplicate concepts.

---

## 2. OKF v0.3 + ADR Extension Schema

### OKF v0.3 Standard Fields
- `type`: `"ADR"` (required)
- `title`: ADR title (e.g., `"ADR-0001: ..."`)
- `description`: One-sentence summary for humans and agents
- `tags`: Cross-cutting category tags (e.g., `[architecture, gcp, cloud-run]`)
- `status`: OKF lifecycle state (**`draft` | `stable` | `deprecated`**)
- `superseded_by`: Replacement concept path (only when `status: deprecated`, e.g., `/0002-new-architecture.md`)
- `generated`: Authoring record `{ by: "<agent>/<ver>" | "human:<id>", at: "<RFC3339>" }`
- `verified`: Verification event list `[{ by: "human:<id>", at: "<RFC3339>" }]`
  - **Trust tier rule (OKF §5.3):** `human-reviewed` requires `verified[].at >= generated.at` with a `human:` actor prefix. When an agent updates substantive content, update `generated.at` without forging human verification.
- `stale_after`: Optional RFC 3339 review deadline (e.g., `"2027-05-27T00:00:00Z"`)
- `sources`: Provenance references (`id`, `resource`, `title`, `author`, etc.), cited in the body via `[^id]` footnotes.

### ADR Extension Fields (`x-` convention per OKF §4.1)
- `x-adr-id`: `"ADR-NNNN"` (e.g., `"ADR-0001"`)
- `x-adr-status`: ADR-specific lifecycle (`proposed` | `accepted` | `rejected` | `superseded`)
- `x-adr-deciders`: List of decision makers (e.g., `["human:theta"]`)

---

## 3. New ADR Template

````markdown
---
type: ADR
title: "ADR-NNNN: Title"
description: "One-sentence summary of the architectural decision."
tags:
  - architecture
status: draft
x-adr-id: "ADR-NNNN"
x-adr-status: "proposed"
x-adr-deciders:
  - "human:theta"
generated:
  by: "human:theta"
  at: "2026-11-27T00:00:00Z"
sources:
  - id: ref-1
    resource: https://example.com/reference
    title: Reference Title
---

> Language: **English** | [日本語](../jp/adr/NNNN-slug.md)

# ADR-NNNN: Title

## 1. Context and Constraints
...

## 2. Decisions
...

## 3. Trade-offs, Cost, and Security Impact
...

[^ref-1]: Reference Title
````
