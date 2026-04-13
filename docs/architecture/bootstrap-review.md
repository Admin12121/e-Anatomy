# Project Status Review

**Date:** 2026-04-09  
**Compared against:** `anatomy_platform_final_structure.md`  
**Repository state reviewed:** `apps/web`, `services/api`, `docker-compose.yml`, SQL migrations

## Executive summary

The repo is in a **bootstrap plus early playground-authoring** stage.

What is in place already:

- the stack from the final architecture is bootstrapped: Next.js, Rust/Axum, PostgreSQL, Redis, Nginx, Docker Compose
- account-aware auth and seeded admin access are working foundations
- the schema already includes the core account/module/version/release tables
- an admin playground exists for zones, modalities, and study-intake driven draft viewer authoring
- a full-screen draft modality viewer now exists with weighting tabs, filmstrip navigation, structure search, group toggles, quick-info/detail drawer, screenshot capture, and persistent slice annotations backed by derived study slices

What is still missing from the final architecture:

- the final Cornerstone/DICOM medical-image engine and viewer boot manifest pipeline
- source upload staging and background ingest processing
- review/publish workflows on top of the new draft annotations and structures
- student-facing catalogue, viewer, search, premium access, audit, and billing layers

The current codebase matches the **platform bootstrap** goals well, but it does **not yet match the final product architecture** for imaging, publishing, or learning content delivery.

## Status legend

- `Completed`: clearly implemented in repo code and migrations
- `Partial`: foundation exists, but the workflow is incomplete
- `Not started`: not present in a meaningful way

## Completed

### 1. Runtime and platform bootstrap

Status: `Completed`

- `apps/web` is a Next.js 16 admin/client app.
- `services/api` is a Rust/Axum service with SQLx migrations and feature routing.
- `docker-compose.yml` provisions Postgres, Redis, API, web, and Nginx.
- the API runs migrations on startup and seeds a default admin user
- the web app proxies authenticated admin requests through Next.js route handlers

Repo evidence:

- `docker-compose.yml`
- `services/api/src/main.rs`
- `services/api/src/infrastructure/state.rs`

### 2. Auth and admin access foundation

Status: `Completed`

- Better Auth integration exists in the web app
- admin-only session checks exist for protected routes and API handlers
- settings UI exists for profile/security management
- Better Auth tables include session, verification, two-factor, and passkey storage

Repo evidence:

- `apps/web/app/(app)/(auth)/login/page.tsx`
- `apps/web/app/(app)/(admin)/settings/page.tsx`
- `apps/web/lib/auth/session.ts`
- `services/api/migrations/202604030001_better_auth.sql`

### 3. Account-centric core schema

Status: `Completed`

- `accounts` and `account_memberships` exist
- the schema already uses account ownership instead of only user ownership
- core module versioning tables are present: `modules`, `module_versions`, `published_releases`
- the API exposes a module list endpoint backed by those tables

Repo evidence:

- `services/api/migrations/202603290001_bootstrap_core.sql`
- `services/api/src/features/modules/application/service.rs`
- `services/api/src/features/modules/infrastructure/repository.rs`

### 4. Early playground authoring shell

Status: `Completed`

- admin playground page exists
- zones can be created from the 3D body shell
- zone details can be edited
- modalities can now be attached to a zone by uploading a DICOM folder or ZIP study directly into the Rust/Axum intake pipeline
- raw source uploads are persisted with ingest-job and source-asset records before slice derivation
- a dedicated draft viewer route exists for each modality so derived slices from the uploaded study can be reviewed as an annotated image stack

Repo evidence:

- `apps/web/app/(app)/(admin)/playground/page.tsx`
- `apps/web/app/(app)/(admin)/playground/_components/index.tsx`
- `apps/web/app/(app)/(admin)/playground/_components/zone-modalities-manager.tsx`
- `apps/web/app/(app)/(admin)/playground/_components/modality-assets-workspace.tsx`
- `services/api/migrations/202604030002_anatomy_zones.sql`
- `services/api/migrations/202604030003_zone_modalities.sql`
- `services/api/migrations/202604030004_zone_modality_assets.sql`
- `services/api/migrations/202604090002_study_ingest_pipeline.sql`

## Partial

### 5. Versioned publishing model

Status: `Partial`

What exists:

- `modules`, `module_versions`, and `published_releases` tables exist
- the backend can report latest version and current published release timestamps in the module list query

What is still missing:

- module create/edit/version authoring APIs
- review states beyond table storage
- publish actions, publish history UI, rollback flow, and release management
- `content_reviews` and `publish_events`

### 6. Source study intake

Status: `Partial`

What exists:

- client-side modality source selection supports DICOM-folder or ZIP-package picking
- the UI inspects the selected files and uploads the selected study directly to the backend intake endpoint
- raw source uploads are persisted as source assets with ingest-job tracking
- the backend derives viewer-ready slice PNGs plus a draft viewer manifest from the uploaded study

What is still missing:

- de-identification / approval path
- ingest queue and worker-driven processing outside the request lifecycle
- richer derived payloads for Cornerstone3D boot, MPR, and higher-fidelity volume delivery

Important note:

The old manual `Viewer Assets` upload path is no longer the intended primary workflow. The canonical admin flow is now study intake first, then automatic slice derivation.

### 7. Admin UX shell

Status: `Partial`

What exists:

- protected admin layout and sidebar
- dashboard route
- settings route
- playground route
- draft modality viewer route for asset review and label authoring

What is still missing:

- most admin pages from the final structure
- upload wizard
- module/version preview pages
- review queue pages
- publish workflow screens

The current dashboard is still only a placeholder.

### 8. Redis and operational readiness

Status: `Partial`

What exists:

- Redis is provisioned in Docker Compose
- the API receives `REDIS_URL` in environment config

What is still missing:

- actual Redis usage in the Rust application
- queue coordination
- background jobs
- rate limits
- ephemeral collaboration state

## Not started

### 9. Medical-image viewer foundation

Status: `Partial`

- a draft stack-style viewer now exists in the admin playground for DICOM-derived study slices
- weighting tabs, filmstrip scrolling, overlay opacity, screenshot export, search, targeted labeling, practice mode, pins mode, and annotation overlays are implemented for the current derived 2D stack model
- persistent structure groups, structures, short descriptions, long descriptions, and per-slice overlay annotations now back that draft viewer

What is still missing:

- no Cornerstone3D integration
- no Cornerstone-backed stack/volume/MPR engine
- no viewer boot manifest pipeline for published/student delivery
- no world-space or frame-of-reference annotation model
- no student viewer route

This is the largest gap between the repo and the final architecture.

### 10. Annotation and structure model

Status: `Partial`

What exists:

- modality-scoped structure groups now exist for viewer toggles and coloring
- modality-scoped structures now store titles, latin names, short descriptions, long descriptions, synonyms, learning points, and access level
- per-slice annotations now store anchor position, label position, polygon overlay points, overlay opacity, note text, and targeted/practice visibility flags
- the draft viewer includes structure editing, annotation placement, label repositioning, and polygon drawing for the current 2D asset model

What is still missing:

- no published/global anatomical structure library across modules
- no versioned annotation sets tied to module versions
- no world-coordinate geometry model
- no annotation review history or diffing

### 11. Review, approval, and publish workflow

Status: `Not started`

- no reviewer workflow
- no review comments/state transitions
- no publish approvals
- no immutable publish UI flow
- no rollback UX

### 12. Student-facing learning product

Status: `Not started`

- no module catalogue pages
- no viewer pages for students
- no anatomy search experience
- no hover/click educational label flow
- no bookmarks, progress, or study tools

### 13. Search

Status: `Not started`

- no search pages
- no search APIs
- no Postgres search document/index strategy in code

### 14. Audit, governance, and compliance workflow

Status: `Not started`

- no `audit_logs`
- no publish-event history
- no sensitive-content approval flow
- no ingestion audit trail

### 15. Billing, entitlement, and institutional growth layer

Status: `Not started`

- no subscription tables
- no pricing/products layer
- no entitlements
- no premium gating
- no institutional/publisher admin workflow beyond the base account schema

## Gap summary by architecture theme

### Strongly aligned already

- Rust owns migrations
- account-centric ownership model
- Next.js + Rust split
- Docker-first local setup
- published-release/version tables exist at the schema level

### Started but still thin

- admin authoring shell
- module-version foundation
- imaging upload concept
- playground draft content model

### Major missing blocks

- Cornerstone viewer
- ingest worker
- annotation system
- review/publish workflow
- student product
- search
- audit
- billing/entitlements

## Recommended next implementation order

1. Build proper source-study ingestion: raw upload persistence, staging records, and background worker processing.
2. Add the first real viewer path using a minimal draft manifest and Cornerstone3D.
3. Introduce structure and annotation tables plus a first annotation editor.
4. Add review and publish APIs/UI on top of the existing module-version schema.
5. Build student-facing catalogue, viewer, and search once authoring and publish paths are stable.

## Bottom line

The repo already contains a solid **platform bootstrap** and a useful **admin playground prototype**.

It does **not** yet contain the core product layers that make the final architecture valuable: imaging ingestion, Cornerstone-based viewing, annotations, educational descriptions, review/publish workflow, and student delivery.

If you want the shortest honest status line:

> Foundation and admin bootstrap are in place.  
> Core anatomy-learning product workflows are still ahead.
