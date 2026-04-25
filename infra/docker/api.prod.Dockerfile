FROM rust:1.93-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/services/api

COPY services/api/Cargo.toml services/api/Cargo.lock services/api/build.rs ./
COPY services/api/migrations ./migrations
COPY services/api/src ./src

RUN cargo build --release

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /workspace/services/api/target/release/api /usr/local/bin/anatomy-api

EXPOSE 8080

CMD ["anatomy-api"]
