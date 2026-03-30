FROM rust:1.93-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl pkg-config ca-certificates \
    && cargo install cargo-watch --locked \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/services/api
