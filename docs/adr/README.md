# Architecture Decision Records (OKF v0.3)

このディレクトリは、[Open Knowledge Format (OKF) v0.3](https://github.com/open-knowledge-format/open-knowledge-format) をベースに **ADR（Architecture Decision Record）用にカスタマイズしたナレッジバンドル** です。

> **Note:** この `README.md` には `type` フロントマターを置かないことで、OKF v0.3 準拠コンシューマーから「非コンセプトの人間向けガイド」として安全にスキップされる設計にしています（OKF SPEC §3.2）。

---

## 1. ディレクトリ規約

- **`index.md`**: バンドルルート宣言（`okf_version: "0.3"`）および ADR 一覧
- **`log.md`**: 変更履歴（フロントマターなし・`## YYYY-MM-DD` 降順）
- **`NNNN-<slug>.md`**: 個別の ADR コンセプト文書（4 桁連番 + ケバブケース、例: `0001-light-architecture.md`）

---

## 2. OKF v0.3 + ADR カスタム拡張スキーマ

### OKF v0.3 標準フィールド
- `type`: `"ADR"`（必須）
- `title`: ADR タイトル（例: `"ADR-0001: ..."`）
- `description`: エージェント・人間向けの 1 文サマリー
- `tags`: 横断分類タグ（例: `[architecture, gcp, cloud-run]`）
- `status`: OKF ライフサイクル状態（**`draft` | `stable` | `deprecated`**）
- `superseded_by`: 置き換え先パス（`status: deprecated` の場合のみ、例: `/0002-new-architecture.md`）
- `generated`: 最終意味変更の記録 `{ by: "<agent>/<ver>" | "human:<id>", at: "<RFC3339>" }`
- `verified`: レビュー記録の配列 `[{ by: "human:<id>", at: "<RFC3339>" }]`
  - **Trust Tier ルール（OKF §5.3）:** `verified[].at >= generated.at` かつ `human:` プレフィックスがある場合のみ `human-reviewed` と判定されます。AI エージェントが内容を書き換えた場合は `generated.at` を更新するため、人間の再確認まで自動的に降格します。
- `stale_after`: 見直し推奨期限（RFC 3339 絶対時刻、例: `"2027-05-27T00:00:00Z"`）
- `sources`: 根拠ソース一覧（`id`, `resource`, `title`, `author`, `last_modified` 等）。本文からは `[^id]` 脚注で参照します。

### ADR 用拡張フィールド（OKF §4.1 `x-` 規約準拠）
- `x-adr-id`: `"ADR-NNNN"`（例: `"ADR-0001"`）
- `x-adr-status`: ADR 固有ステータス（`proposed` | `accepted` | `rejected` | `superseded`）
- `x-adr-deciders`: 意思決定者リスト（例: `["human:theta"]`）

---

## 3. 新規 ADR テンプレート

````markdown
---
type: ADR
title: "ADR-NNNN: タイトル"
description: "この意思決定の 1 文サマリー。"
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

# ADR-NNNN: タイトル

## 1. コンテキストと制約
...

## 2. 決定事項
...

## 3. トレードオフ・コスト・セキュリティ影響
...

[^ref-1]: Reference Title
````
