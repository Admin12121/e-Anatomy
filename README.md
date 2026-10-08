# Anatomy Platform Bootstrap

/apps/web/public/og.webp

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
./scripts/setup.sh
```

3. Open:

- `http://localhost`
- `http://localhost/login`
- `http://localhost/api/v1/health/ready`

You can also use:

- `http://localhost:3000` for direct Next.js access
- `http://localhost:8080/api/v1/health/live` for direct API access

Useful development commands:

```bash
./scripts/setup.sh -dev logs
./scripts/setup.sh -dev down
./scripts/setup.sh -dev config
```

## Default admin

- email: `admin@gmail.com`
- password: `admin@#12`

The API owns database migrations, including the Better Auth tables. The web app only bootstraps the matching Better Auth admin user on startup after the API migrations have completed.

## Production Deployment With Host PostgreSQL

Use the production deploy script on a fresh Debian/Ubuntu host after Docker and PostgreSQL are installed:

```bash
cp .env.production.example .env
# Edit .env: domain, database password, auth secrets, deploy SSH policy, and email settings.
./scripts/setup.sh -prod
```

Production uses the same `docker-compose.yml` file as development. The production containers are selected by the `prod` Compose profile and run with host networking so the API can reach host PostgreSQL through `127.0.0.1`. Do not use `host.docker.internal` in production `DATABASE_URL`.

The setup flow creates the deploy user from `DEPLOY_USER` (`altharld` by default), disables SSH root login, allows SSH only for that deploy user, enables UFW, fail2ban, persistent journald logs, unattended security updates, prepares the PostgreSQL role/database, prepares media directories, syncs the app to `DEPLOY_APP_DIR` (`/srv/anatomy/app` by default), renders a domain-aware nginx config, runs Docker Compose as the deploy user, and issues a Let's Encrypt certificate when `TLS_ENABLE=true`.

Before enabling TLS, make sure:

- `APP_DOMAIN` resolves to the server IP.
- `APP_DOMAIN_ALIASES`, such as `www.thevoxelanatomy.com`, also resolve to the server IP or are empty.
- ports `80/tcp` and `443/tcp` are open in the host firewall and provider firewall.
- `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, and `NEXT_PUBLIC_SITE_URL` use the final `https://` domain.

The generated production nginx config blocks raw-IP and unknown-host HTTP requests, serves ACME HTTP-01 challenges from `HOST_CERTBOT_WEBROOT`, redirects the configured domain from HTTP to HTTPS after the certificate exists, and terminates HTTPS on port 443.

Run a specific production step when you do not want the full flow:

```bash
./scripts/setup.sh -prod --only db
./scripts/setup.sh -prod --only nginx
./scripts/setup.sh -prod --only tls
./scripts/setup.sh -prod --skip hardening
./scripts/setup.sh -prod compose
./scripts/setup.sh -prod check
```

`scripts/deploy-host-db.sh` is kept as a compatibility wrapper for `./scripts/setup.sh -prod`.

## Releases

A release is a `vMAJOR.MINOR.PATCH` tag on the current `main` HEAD:

```bash
git tag v1.0.1 && git push origin v1.0.1
```

`.github/workflows/release.yml` verifies the tag, runs the frontend checks (typecheck, lint, tests) and
backend checks (fmt, clippy, tests), builds and pushes the release images to GHCR, deploys, and keeps only
the deployed release and the one before it in GHCR. Deployment tooling and configuration live on the
server only.
