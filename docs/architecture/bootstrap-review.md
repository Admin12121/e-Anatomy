# Bootstrap Review Notes

## What was implemented

- Rust/Axum API bootstrapped under `services/api`
- SQLx migrations for the first identity, ownership, content, and session tables
- Seeded default admin and owner account
- Frontend auth shell and protected dashboard in `apps/web`
- Docker Compose dev stack with Postgres, Redis, API, web, and Nginx

## Scope intentionally left for later

- Better Auth integration
- structure library, imaging, ingest worker, annotations, and publish workflow UI
- viewer integration with Cornerstone3D
- fine-grained authorization and audit logs

## Tool references reviewed for this pass

- Next.js App Router docs: https://nextjs.org/docs/app
- Next.js self-hosting and Docker guidance: https://nextjs.org/docs/app/guides/self-hosting#docker-image
- Next.js local docs in `apps/web/node_modules/next/dist/docs/`, especially:
  - `01-app/03-api-reference/04-functions/headers.md`
  - `01-app/03-api-reference/04-functions/redirect.md`
  - `01-app/02-guides/authentication.md`
- Axum router state docs: https://docs.rs/axum/latest/axum/struct.Router.html
- SQLx embedded migrations macro docs: https://docs.rs/sqlx/latest/sqlx/macro.migrate.html
- Argon2 password hashing docs: https://docs.rs/argon2/latest/argon2/
- Docker Compose startup order: https://docs.docker.com/compose/how-tos/startup-order/
- Docker bind mounts: https://docs.docker.com/engine/storage/bind-mounts/
