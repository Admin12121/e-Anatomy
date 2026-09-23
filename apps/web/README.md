# Web App

Next.js 16 App Router app for the anatomy platform.

Current scope:

- Better Auth + Drizzle-managed login and session handling
- protected admin dashboard for manual review
- RTK Query-managed module data via authenticated Next.js route handlers
- Docker-first local development with hot reload

## Local auth bootstrap

`bun run auth:bootstrap` is safe to run against a fresh API database. After the
Rust API migrations have created the `accounts` schema, the bootstrap now
creates the configured platform account when it is missing (default slug:
`platform-admin`), then creates/links the Better Auth administrator and its
owner membership. Re-running the command is idempotent.

Optional account seed variables:

- `BOOTSTRAP_ADMIN_ACCOUNT_SLUG` (default `platform-admin`)
- `BOOTSTRAP_ADMIN_ACCOUNT_NAME` (default `Platform Admin`)
- `BOOTSTRAP_ADMIN_ACCOUNT_TYPE` (default `system`)
