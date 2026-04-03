# Anatomy Platform Bootstrap

This repository now matches the early monorepo shape from the architecture brief:

- `apps/web`: Next.js 16 app with Better Auth, Drizzle table mappings, and RTK Query
- `services/api`: Rust/Axum API with SQLx migrations and account-aware auth
- `infra/docker`: dev container images
- `infra/nginx`: local reverse proxy for `http://localhost`
- `docs/architecture`: implementation notes for manual review

## Current scope

- Better Auth authentication backed by API-owned SQL migrations and seeded admin credentials
- account, membership, module, module version, published release, and session tables
- protected admin dashboard in the frontend
- RTK Query-managed module data fetching through authenticated Next.js route handlers
- Docker-first development with hot reload for the web app through bind mounts

## Local development

1. Optional: copy `.env.example` to `.env` if you want to override defaults.
2. Start the stack:

```bash
docker compose up --build
```

3. Open:

- `http://localhost`
- `http://localhost/login`
- `http://localhost/api/v1/health/ready`

You can also use:

- `http://localhost:3000` for direct Next.js access
- `http://localhost:8080/api/v1/health/live` for direct API access

## Default admin

- email: `admin@gmail.com`
- password: `admin@#12`

The API owns database migrations, including the Better Auth tables. The web app only bootstraps the matching Better Auth admin user on startup after the API migrations have completed.
