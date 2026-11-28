# syntax=docker/dockerfile:1
#
# Build from the repository root so both `proto/` and `web-app/api/` are in context:
#   docker build -f web-app/api/Dockerfile -t agent-ready-app-api .

FROM rust:1-bookworm AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends protobuf-compiler libprotobuf-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/web-app/api

# Copy shared Protobuf contracts preserving the `../../proto` layout expected by build.rs.
COPY proto /workspace/proto

# Copy crate manifests and build scripts.
COPY web-app/api/Cargo.toml web-app/api/Cargo.lock ./
COPY web-app/api/build.rs ./
COPY web-app/api/migrations ./migrations
COPY web-app/api/src ./src

RUN cargo build --release --locked \
    && strip /workspace/web-app/api/target/release/agent-ready-app-api

FROM gcr.io/distroless/cc-debian12:nonroot AS runtime

WORKDIR /app

COPY --from=builder /workspace/web-app/api/target/release/agent-ready-app-api /app/agent-ready-app-api

ENV PORT=8080
ENV RUST_LOG=info

EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT ["/app/agent-ready-app-api"]
