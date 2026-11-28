# Protobuf & Connect RPC Contracts (`proto/`)

This directory contains the canonical Protocol Buffers (`.proto`) service and message contracts shared between the SvelteKit BFF (`web-app/app/`) and the Rust Connect RPC backend (`web-app/api/`) in the **Standard** architecture.

## Contracts

| Package | File | Service | Purpose |
| :--- | :--- | :--- | :--- |
| `tenant.v1` | [`tenant/v1/tenant.proto`](./tenant/v1/tenant.proto) | `TenantService` | Personal tenant provisioning (`EnsurePersonalTenant`), tenant listing (`ListTenants`), and active tenant resolution (`GetActiveTenant`). |
| `todo.v1` | [`todo/v1/todo.proto`](./todo/v1/todo.proto) | `TodoService` | Tenant-scoped TODO CRUD (`ListTodos`, `CreateTodo`, `UpdateTodo`, `ToggleTodo`, `DeleteTodo`) matching the Light TODO sample model extended with `tenant_id` and `created_by_user_id`. |

## Linting & Breaking-Change Checks

This repository uses [Buf v2](https://buf.build/docs/) configured via root [`buf.yaml`](../buf.yaml) (`STANDARD` lint rules, `FILE` breaking-change rules).

Run lint from the repository root:

```bash
bunx @bufbuild/buf lint
```

Check formatting and breaking changes against `main`:

```bash
bunx @bufbuild/buf format -d --exit-code
bunx @bufbuild/buf breaking --against '.git#branch=main'
```

## Code Generation

### TypeScript (`web-app/app/`)

[`buf.gen.yaml`](../buf.gen.yaml) generates TypeScript descriptors into `web-app/app/src/lib/gen/` using `protoc-gen-es` v2 (`target=ts`, `import_extension=js`), ready for `@connectrpc/connect` v2 and `@bufbuild/protobuf` v2.

Once `@bufbuild/protoc-gen-es` is installed in `web-app/app/`:

```bash
PATH="$PWD/web-app/app/node_modules/.bin:$PATH" bunx @bufbuild/buf generate
```

### Rust (`web-app/api/`)

The Rust backend compiles `.proto` files directly from `proto/` at build time in `web-app/api/build.rs` (via `prost-build` / Connect RPC codegen). No generated Rust files are committed into the repository.
