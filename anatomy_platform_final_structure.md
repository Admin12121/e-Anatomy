# Anatomy Learning Platform — Final Architecture, Schema, and Delivery Plan
**Date:** 2026-03-29  
**Stack baseline:** Next.js 16.2 (App Router), Rust/Axum, PostgreSQL 16, Redis 7, Nginx, Docker Compose  
**Primary goal:** Build a production-grade anatomy e-learning platform with a high-performance medical-image viewer, robust admin authoring workflow, and a database model that can grow later into customers, billing, premium access, and institutional licensing without painful rewrites.

---

## 1) Executive summary

This document replaces the earlier assumption that the product was a clinical AI / PII-heavy medical system.

It is **not** primarily a diagnostic AI platform.

It **is** a **content-driven anatomy learning platform** where:

- admins upload CT/MRI and similar imaging studies
- admins configure multi-series modules (T1, T2, FLAIR, ADC, etc.)
- admins draw labels, attach short and long descriptions, and organize structures into categories
- students browse a detailed catalogue, open a viewer, toggle what is visible, search anatomy, hover labels for short context, and click for full explanations
- the system must stay smooth and educationally polished, not just technically “working”

The right architecture for this product is:

1. **Next.js** for catalogue pages, admin shell, auth entrypoints, and SSR UI
2. **Rust/Axum** for imaging APIs, ingestion pipeline, publishing, search endpoints, and real-time sync
3. **PostgreSQL** as the source of truth
4. **Redis** for hot cache, rate limits, queue coordination, and ephemeral collaboration state
5. **Cornerstone3D v4** as the imaging/rendering foundation inside your custom product UI
6. **Versioned content publishing** so students always see stable published modules while admins keep editing drafts

The biggest architectural change from the earlier draft is this:

> Do not build the long-term viewer around a fully custom tile renderer and 2D normalized label coordinates as the canonical truth.
> Build the platform around a **versioned content model** and a **proven imaging engine**.

---

## 2) What is already good in your current direction

These decisions are good and should stay:

### 2.1 Rust owns DDL
Keep **Rust + sqlx migrations** as the only schema owner.

**Why**
- one source of truth for DDL
- fewer migration conflicts
- easier deployment discipline
- clearer production responsibility

**How**
- Rust owns all `CREATE TABLE`, `ALTER TABLE`, index creation, constraints, triggers, and generated columns
- Drizzle stays a typed query layer only in Next.js
- schema changes always happen in this order:
  1. Rust SQL migration
  2. Rust query/model update
  3. Drizzle mirror update
  4. frontend adoption

### 2.2 PostgreSQL on the host, app services in Docker
For a single VPS launch, this is reasonable.

**Why**
- easier DB backup/restore
- easier upgrades
- clearer disk ownership
- less risk than coupling data lifecycle to containers

**How**
- PostgreSQL 16 runs on host OS
- Nginx, Next.js, Rust, Redis run in Docker Compose
- backend containers connect through Unix socket or local TCP, depending on your operational preference

### 2.3 16-bit image fidelity matters
You were correct to care about preserving dynamic range and doing window/level on the client side.

**Why**
- CT and MRI learning content depends on tonal detail
- baking everything into 8-bit assets limits educational value
- student interaction with presets and window/level is part of the learning experience

**How**
- preserve original DICOM as source assets
- derive optimized viewer payloads for the frontend
- keep window/level/presentation logic in the viewer runtime, not in pre-baked JPEG-only outputs

---

## 3) Deep review of the current draft — the main flaws

This section reviews the current architecture direction and where it should change.

---

### 3.1 Flaw: the viewer core is too custom

The earlier draft centered the viewer on:
- custom tile derivation
- custom zstd transport
- custom WebGL fragment shader
- custom label overlay system
- custom slice prefetch and cache rules

That is fine for a prototype, but risky as the permanent core.

**Why this is a problem**
- you take ownership of low-level image rendering, viewport math, annotation geometry, and compatibility behavior
- every future feature becomes expensive:
  - MPR improvements
  - 3D viewport
  - linked viewports
  - richer annotations
  - frame-of-reference correctness
  - segmentation overlays
  - future fusion or advanced datasets
- maintenance cost becomes very high compared to the real differentiator of your product, which is **educational content and authoring UX**

**What to do instead**
Use **Cornerstone3D v4** as the medical-imaging engine, and build your custom catalogue, learning UX, overlays, detail drawers, premium gating, and admin tools around it.

**Result**
You own the product experience, while Cornerstone owns the imaging substrate.

---

### 3.2 Flaw: 2D normalized slice coordinates should not be the canonical annotation truth

The earlier draft stores label coordinates such as:
- `x`
- `y`
- `anchor_x`
- `anchor_y`

normalized to the slice.

This is okay for rendering hints, but weak as the source of truth.

**Why this is a problem**
- resolution changes can alter semantics
- regenerated derived assets can drift
- the same structure should map across different viewports
- volume views and MPR need stable, image-space or world-space meaning
- cross-reference navigation becomes fragile

**What to do instead**
Store annotation truth in **medical-image coordinates / world coordinates** and keep screen-space coordinates only as optional presentation hints.

**Canonical annotation truth should include**
- `frame_of_reference_uid`
- `referenced_image_id` or instance UID
- view plane metadata
- world-space points / geometry
- structure link
- optional visible slice range
- optional presentation hint for label placement

---

### 3.3 Flaw: upload processing is too synchronous

The earlier direction implied that upload and derivation happen as part of the upload flow.

**Why this is a problem**
- large studies will block
- retries are harder
- failures become messy
- partial ingestion becomes difficult to represent
- admin UX becomes brittle

**What to do instead**
Split ingestion into separate phases:

1. upload to staging
2. validate
3. enqueue processing
4. derive assets
5. create draft module version
6. admin edits annotations
7. review
8. publish

---

### 3.4 Flaw: file-per-slice-per-tier layout will become hard to manage

The earlier tile structure is easy to start with, but not ideal long term.

**Why this is a problem**
- file explosion
- difficult lifecycle cleanup
- difficult migration to object storage
- awkward versioning
- more operational pain on large content catalogs

**What to do instead**
Use a storage model with:
- immutable source asset records
- immutable derived asset records
- version-aware manifests
- stable asset IDs
- pluggable local-disk or S3-compatible backends

This gives you a clean path from:
- single VPS local disk now
to
- S3 / object storage later

---

### 3.5 Flaw: published and draft content are not clearly separated

This is the most serious product flaw.

**Why this matters**
A learning atlas product must behave like publishing software:
- editors work on drafts
- students read published versions
- changes are reviewable
- rollbacks are possible
- published modules are immutable snapshots

**What to do**
Add:
- `module_versions`
- `published_releases`
- `content_reviews`
- `publish_events`

Never mutate live student content in place.

---

### 3.6 Flaw: current schema is too narrow for future product growth

The earlier content model is too small for:
- paid access
- premium modules
- organization/institution subscriptions
- translators/reviewers
- quiz and progress systems
- notes/bookmarks/history
- access control per account, not just per user

**What to do**
Adopt an **account-centric** business schema now, even if billing is not active at MVP.

---

### 3.7 Flaw: auth transport was discussed more than auth domain design

The custom Rust JWT bridge may still be acceptable, but it is not the main hard problem.

The bigger missing pieces are:
- role model
- ownership model
- membership model
- review workflow
- audit model
- future organization/institution fit

**What to do**
Keep auth transport thin.
Make authorization and business ownership explicit in the schema.

---

## 4) Why Cornerstone3D v4 should be the imaging foundation

## 4.1 What Cornerstone3D v4 gives you

Cornerstone’s current documentation shows **4.0 as the latest release line**, with dedicated 4.x migration guides. It supports multiple viewport types, including stack, orthographic/volume, 3D volume, video, and whole-slide imaging. The documentation also states that volume viewports support MPR by design, and that Cornerstone Tools manages annotations in a `FrameOfReference` state manager using world coordinates. It also introduces the **VoxelManager** architecture to reduce large scalar-array duplication and rely on image cache / targeted voxel access rather than forcing all data through one giant scalar array. Node.js 20+ is required for 4.x.  

That combination is a very strong fit for your platform.

### Why it fits this product specifically
Because your platform needs:
- axial / sagittal / coronal viewing
- multiple series and weightings
- scalable annotations
- detail-driven anatomy overlays
- future 3D expansion
- future richer educational overlays
- a viewer foundation that is already built for medical imaging, not generic canvas work

---

## 5) Cornerstone3D v4 — what, why, how

### 5.1 What
Use Cornerstone3D v4 **inside** the viewer page, not as the entire product shell.

That means:
- Next.js still owns page routing, SSR, catalogue, layout, auth shell
- Cornerstone owns medical rendering inside a viewer island

### 5.2 Why
This gives you the best split of responsibility:
- you keep full control over product UX and branding
- you do not reinvent viewport math and annotation semantics
- you can grow into more advanced imaging without rewriting the core

### 5.3 How
Build the viewer in layers:

#### Layer A — Page shell (Next.js server component)
Loads:
- module title
- body region
- available series and weightings
- structure counts
- viewer boot manifest
- access tier / premium entitlement state

#### Layer B — Viewer island (Next.js client component)
Initializes:
- Cornerstone rendering engine
- 1-up, 2-up, or 4-up layout
- stack or volume viewport
- default display set
- synchronized slice state

#### Layer C — Learning overlay layer
Your product-specific UI:
- structure category toggles
- hover tooltips
- click-to-open detail drawer
- related structures
- bookmarks
- note taking
- “show only selected category”
- “practice mode”
- “pin mode”
- “quiz mode” later

#### Layer D — Admin authoring layer
For editors:
- annotation placement
- structure picker
- label placement hint adjustment
- long description linking
- version diff / preview
- publish review flow

---

## 6) Cornerstone3D v4 — latest practical notes you should care about

### 6.1 Node requirement
Cornerstone 4.x requires **Node.js 20 or higher**.

**Impact**
Your Next.js app and any tooling around the viewer should standardize on Node 20+.

### 6.2 Viewport model
Cornerstone documents these relevant viewport patterns:
- **StackViewport** for ordered image stacks
- **VolumeViewport / Orthographic viewport** for volume-based views and MPR
- **VolumeViewport3D** for 3D rendering

**Recommendation**
For your main anatomy viewer:
- use **StackViewport** when a module is a simple stack-only learning module
- use **Volume / Orthographic viewports** for modules that need axial/sagittal/coronal consistency
- use **VolumeViewport3D** only as a secondary feature, not MVP core

### 6.3 Annotation model
Cornerstone Tools documents a **FrameOfReference** annotation state manager using **world coordinates**.

**Impact on your schema**
Store annotation truth in a way that can map cleanly to:
- world-space handles / points
- frame-of-reference
- referenced image / slice / volume context

### 6.4 VoxelManager direction
Cornerstone’s VoxelManager documentation emphasizes:
- reduced memory usage
- using image cache as the source of truth
- targeted voxel access instead of forcing giant scalar arrays
- improved handling of large datasets

**Why this matters**
It aligns well with your performance goals and lowers the need for a custom low-level voxel architecture.

### 6.5 4.x migration direction
Cornerstone 4.x migration docs show:
- **edge-to-edge viewport display** instead of the old 10% padding by default
- removal of deprecated timepoint-based dynamic volume API in favor of **dimension-group based API**
- Node 20+ requirement

**What that means for your product**
- less wasted screen space
- better alignment with modern responsive viewer layouts
- cleaner long-term API direction if you ever ingest dynamic or grouped imaging datasets

---

## 7) Final target architecture

## 7.1 High-level shape

```text
Browser
  -> Nginx
      -> Next.js web app
      -> Rust API
      -> Rust ingest worker (indirect via jobs)
      -> Redis
      -> PostgreSQL
      -> Local asset storage (now) / object storage (later)
```

## 7.2 Planes of the system

### Plane A — Delivery plane
Serves students and public pages.

**Contains**
- homepage
- body regions
- filters
- premium/free module cards
- module detail pages
- viewer boot shell

### Plane B — Authoring plane
Used by admins, editors, and reviewers.

**Contains**
- upload wizard
- ingestion monitoring
- module editor
- structure editor
- annotation editor
- preview
- publish workflow

### Plane C — Imaging plane
Processes and serves imaging content.

**Contains**
- DICOM validation
- metadata extraction
- de-identification gate
- derived viewer manifests
- thumbnails
- viewport metadata
- series/display set generation

### Plane D — Platform plane
Business and platform services.

**Contains**
- auth
- role model
- account memberships
- future billing
- entitlements
- analytics
- audit log
- webhooks
- notifications later

---

## 8) Final repository / project structure

```text
anatomy-platform/
├─ apps/
│  └─ web/                                # Next.js 16.2
│     ├─ app/
│     │  ├─ (public)/
│     │  │  ├─ page.tsx
│     │  │  ├─ regions/[regionSlug]/page.tsx
│     │  │  ├─ modalities/[modalitySlug]/page.tsx
│     │  │  ├─ modules/[moduleSlug]/page.tsx
│     │  │  └─ search/page.tsx
│     │  ├─ viewer/[moduleSlug]/page.tsx
│     │  ├─ admin/
│     │  │  ├─ dashboard/page.tsx
│     │  │  ├─ uploads/page.tsx
│     │  │  ├─ ingest-jobs/[jobId]/page.tsx
│     │  │  ├─ modules/[moduleId]/page.tsx
│     │  │  ├─ modules/[moduleId]/versions/[versionId]/editor/page.tsx
│     │  │  ├─ modules/[moduleId]/versions/[versionId]/preview/page.tsx
│     │  │  ├─ structures/page.tsx
│     │  │  └─ reviews/page.tsx
│     │  └─ api/auth/[...all]/route.ts
│     ├─ components/
│     │  ├─ catalogue/
│     │  ├─ viewer/
│     │  ├─ admin/
│     │  └─ shared/
│     ├─ lib/
│     │  ├─ auth/
│     │  ├─ api/
│     │  ├─ viewer/
│     │  ├─ access/
│     │  └─ search/
│     └─ package.json
│
├─ services/
│  ├─ api/                                # Rust Axum public/read-write API
│  │  ├─ src/
│  │  │  ├─ authz/
│  │  │  ├─ routes/
│  │  │  ├─ catalog/
│  │  │  ├─ modules/
│  │  │  ├─ structures/
│  │  │  ├─ annotations/
│  │  │  ├─ imaging/
│  │  │  ├─ publish/
│  │  │  ├─ progress/
│  │  │  ├─ search/
│  │  │  ├─ realtime/
│  │  │  ├─ jobs/
│  │  │  ├─ storage/
│  │  │  └─ db/
│  │  ├─ migrations/
│  │  └─ Cargo.toml
│  │
│  └─ ingest-worker/                      # Rust background worker
│     ├─ src/
│     │  ├─ staging/
│     │  ├─ dicom/
│     │  ├─ validate/
│     │  ├─ deidentify/
│     │  ├─ derive/
│     │  ├─ manifests/
│     │  ├─ thumbnails/
│     │  ├─ publish/
│     │  └─ cleanup/
│     └─ Cargo.toml
│
├─ packages/
│  ├─ contracts/                          # OpenAPI / JSON schema / shared DTOs
│  ├─ db-types/                           # generated TS types
│  ├─ ui/                                 # shared design system
│  └─ eslint-config/
│
├─ infra/
│  ├─ nginx/
│  ├─ docker/
│  ├─ scripts/
│  ├─ backups/
│  └─ runbooks/
│
└─ docs/
   ├─ architecture/
   ├─ schema/
   ├─ ingest/
   ├─ viewer/
   └─ operations/
```

---

## 9) Final frontend architecture

## 9.1 What the frontend should own

### Public / student-facing
- home page
- region pages
- modality filters
- premium/free cards
- module detail pages
- search result pages
- subscription / sign-in pages

### Viewer UX
- loading shell
- toolbar
- series/weighting switcher
- structure toggle sidebar
- hover tooltips
- click drawer with long content
- practice mode
- bookmarks
- notes later
- quiz trigger later

### Admin UX
- upload wizard
- ingestion job monitor
- draft module editor
- structure library editor
- annotation editor
- preview and publish workflow

## 9.2 Server vs client split

### Server components
Use for:
- catalogue pages
- region and modality SSR pages
- module metadata shell
- access-tier checks
- admin table/list pages
- search page shell

### Client components
Use for:
- Cornerstone viewer
- annotation editor
- drag/drop upload controls
- live job progress
- interactive filters with instant feedback
- local UI state such as structure visibility

---

## 10) Final backend architecture

## 10.1 Services

### `api`
Handles:
- catalogue APIs
- module APIs
- structures APIs
- annotation CRUD
- publish APIs
- progress APIs
- search APIs
- asset manifest APIs
- real-time room control
- webhook endpoints

### `ingest-worker`
Handles:
- upload staging consumption
- DICOM validation
- metadata extraction
- de-identification step
- derivation of viewer assets
- thumbnail generation
- draft attachment
- cleanup / retry logic

### Redis
Use for:
- job coordination
- rate limits
- ephemeral collaboration state
- websocket presence
- hot manifest cache
- short-lived pre-signed/internal asset references if needed

### PostgreSQL
Use for:
- all durable business state
- all durable content state
- publish history
- entitlements
- user progress
- audit trail
- job tracking

---

## 11) Imaging pipeline — final version

## 11.1 Recommended flow

```text
Admin upload
  -> staging storage
  -> create ingest_job
  -> worker validates DICOM set
  -> extract metadata
  -> optional de-identification gate
  -> derive viewer assets + thumbnails + manifests
  -> create / update draft module version
  -> admin reviews and annotates
  -> reviewer approves
  -> publish immutable release
```

## 11.2 What to store

### Source assets
Store raw uploaded source studies immutably.

**Why**
- you may need to re-derive later
- you may improve processing pipeline later
- auditability and reprocessing become easier

### Derived assets
Store optimized assets separately:
- thumbnails
- viewer manifests
- preview images
- optional slice-level fallback assets
- optional volume cache artifacts

### Metadata
Store extracted metadata in structured tables plus a raw JSONB shadow for vendor-specific or future use.

---

## 12) De-identification gate

Even though this is an e-learning platform and not a clinical AI product, the upload path may still receive real medical studies.

That means you should design a **de-identification gate** now.

### Recommended rule
Any upload that is intended for student-facing publication should pass a de-identification profile / approval step before publish.

### Why
- real-world CT/MRI can contain identifying metadata
- some datasets can contain burned-in pixel identifiers or recognizable features
- teaching-file style use cases are explicitly discussed by the DICOM confidentiality profiles, which exist for de-identification use cases such as teaching files and publication

### How
At minimum:
- separate raw upload from publishable draft
- mark each ingestion with a privacy status
- require reviewer approval if the source is not from a verified non-sensitive dataset
- store de-identification policy version and outcome in the database

---

## 13) The most important design choice: account-first schema

Because you want the schema to support future:
- customers
- payments
- premium modules
- institutional access
- organizations / colleges
- team ownership
- content reviewers / editors
- later B2B or B2C combinations

you should not design around only `user`.

You should design around **account**.

## 13.1 Principle

- `user` = identity
- `account` = ownership / billing / entitlement boundary

A single user can belong to multiple accounts later:
- personal account
- institution account
- organization account
- publisher account

That gives you a clean path to:
- individual subscriptions
- college licenses
- team editorial workflows
- account-wide premium access

---

## 14) ID strategy

## 14.1 Recommended approach

### Auth-layer tables
Use the ID format Better Auth expects, if needed:
- `user.id TEXT`
- `session.id TEXT`
- `account.id TEXT` for auth provider account records

### Business/content tables
Use `UUID` for platform/business entities:
- modules
- versions
- series
- structures
- annotations
- accounts
- plans
- products
- subscriptions

### Bridge fields
Use explicit FK columns when a business entity references an auth user:
- `created_by_user_id TEXT REFERENCES user(id)`
- `updated_by_user_id TEXT REFERENCES user(id)`

**Why this split is good**
- avoids fighting Better Auth defaults
- keeps business objects strongly typed and provider-agnostic
- makes external integrations easier later

---

## 15) Final database design principles

## 15.1 Core principles

### 1. Version content, do not mutate published content
Published releases should be immutable.

### 2. Store entitlement rules separately from content
Do not scatter `is_premium BOOLEAN` everywhere.

### 3. Separate source imaging from derived viewer assets
Never make derived assets your only truth.

### 4. Separate identities from owning/billing entities
User is not enough for future growth.

### 5. Prefer append-only audit/event history for important state changes
Especially for:
- publishing
- access changes
- role changes
- billing later
- ingest job state

### 6. Use JSONB for raw metadata shadows, not as the primary relational design
Structured columns first. JSONB for extra/unknown vendor data.

### 7. Put search-ready data close to content
Generated or maintained search columns should exist in Postgres from the start.

### 8. Partition only hot growth tables, not everything
Apply partitioning surgically.

### 9. Keep “future billing” tables additive
So you can ship MVP without activating them.

### 10. Design soft-delete + publish-state separately
A draft can be archived without affecting published student releases.

---

## 16) Final schema groups

## 16.1 Identity and access

### `users`
Auth identity table.

**Key columns**
- `id TEXT PK`
- `email`
- `email_verified_at`
- `display_name`
- `avatar_url`
- `status`
- `last_login_at`
- `created_at`
- `updated_at`

### `accounts`
Business ownership boundary.

**Key columns**
- `id UUID PK`
- `account_type` (`personal`, `institution`, `publisher`, `system`)
- `slug`
- `name`
- `status`
- `owner_user_id TEXT NULL`
- `auth_organization_id TEXT NULL`
- `created_at`
- `updated_at`

### `account_memberships`
Links users to accounts.

**Key columns**
- `id UUID PK`
- `account_id UUID FK`
- `user_id TEXT FK`
- `role_code`
- `status`
- `joined_at`
- `invited_by_user_id TEXT NULL`

### `roles`
Catalog of business roles.

Examples:
- `owner`
- `admin`
- `editor`
- `reviewer`
- `translator`
- `student`
- `support`

### `permissions` and `role_permissions`
Optional if you want fine-grained business permissions in DB.
Otherwise keep permission map in code first.

### `audit_logs`
Track security-sensitive and business-sensitive changes.

**Examples**
- membership added
- role changed
- module published
- structure edited
- annotation deleted
- access policy changed

---

## 16.2 Content taxonomy

### `body_regions`
Examples:
- brain
- head-neck
- spine
- thorax
- abdomen-pelvis
- upper-limb
- lower-limb
- whole-body

### `modalities`
Examples:
- MRI
- CT
- Angiography
- Illustration
- Radiography

### `module_collections`
Optional grouping for larger content families.

### `modules`
Stable content identity. Never store all edit history directly here.

**Key columns**
- `id UUID PK`
- `account_id UUID FK`              # owning publisher/institution
- `slug`
- `title`
- `subtitle`
- `body_region_id`
- `primary_modality_id`
- `default_access_policy_id NULL`
- `status`                          # draftable/publishable/archived
- `created_by_user_id`
- `created_at`
- `updated_at`

### `module_versions`
Draftable and publishable revision unit.

**Key columns**
- `id UUID PK`
- `module_id UUID FK`
- `version_no INT`
- `state`                           # draft / in_review / approved / published / retired
- `title_override NULL`
- `summary`
- `learning_objectives JSONB`
- `viewer_layout_code`
- `default_display_set_id NULL`
- `search_document TSVECTOR or generated text columns strategy`
- `created_by_user_id`
- `created_at`
- `updated_at`

### `published_releases`
Immutable mapping of which version is live.

**Key columns**
- `id UUID PK`
- `module_id UUID FK`
- `module_version_id UUID FK`
- `published_at`
- `published_by_user_id`
- `release_notes`
- `is_current BOOLEAN`

---

## 16.3 Structure library

### `structure_categories`
Examples:
- cerebral lobes
- ventricles/cisterns
- arteries
- venous sinuses
- cranial nerves
- white matter

### `structures`
Stable identity for an anatomical structure.

**Key columns**
- `id UUID PK`
- `canonical_name`
- `latin_name NULL`
- `category_id`
- `search_synonyms JSONB`
- `status`
- `created_at`
- `updated_at`

### `structure_content_versions`
Versioned explanatory content for structures.

**Key columns**
- `id UUID PK`
- `structure_id UUID FK`
- `language_code`
- `version_no`
- `short_description`
- `long_description_md`
- `clinical_note NULL`
- `pearls NULL`
- `references_md NULL`
- `created_by_user_id`
- `created_at`

### `structure_relations`
Cross-links between structures.

Examples:
- parent-child
- adjacent-to
- part-of
- related-to

---

## 16.4 Imaging identity

### `studies`
Logical study-level record for uploaded source imaging.

### `series`
DICOM or source series record.

**Key columns**
- `id UUID PK`
- `study_id UUID FK`
- `series_uid TEXT NULL`
- `modality_code`
- `series_description`
- `orientation_hint`
- `instance_count`
- `rows`
- `columns`
- `spacing_x`
- `spacing_y`
- `spacing_z NULL`
- `frame_of_reference_uid TEXT NULL`
- `raw_metadata JSONB`
- `created_at`

### `instances`
Per-instance record where needed.

### `instance_frames`
Only if you need multi-frame detail at scale.

### `series_variants`
This is important for your product.

Represents viewable variants such as:
- T1
- T2
- T1 Gado
- FLAIR
- ADC
- DWI
- SWI
- etc.

**Key columns**
- `id UUID PK`
- `module_version_id UUID FK`
- `series_id UUID FK`
- `variant_code`
- `display_name`
- `sort_order`
- `is_default BOOLEAN`

### `display_sets`
Defines grouped viewer layouts and compatible view states.

Examples:
- single axial T1
- axial/coronal/sagittal synchronized MRI
- CT brain with predefined bone and soft tissue presets

### `display_set_items`
Maps display sets to series variants and viewport orientation rules.

---

## 16.5 Derived assets

### `source_assets`
Source upload files and bundles.

**Key columns**
- `id UUID PK`
- `storage_backend`
- `storage_key`
- `checksum`
- `mime_type`
- `size_bytes`
- `ingest_job_id UUID FK`
- `created_at`

### `derived_assets`
Derived artifacts for viewer delivery.

**Key columns**
- `id UUID PK`
- `module_version_id UUID FK`
- `series_variant_id UUID NULL`
- `asset_kind`                      # thumbnail / preview / manifest / fallback_image / tileset / volume_cache
- `format_code`
- `storage_backend`
- `storage_key`
- `checksum`
- `size_bytes`
- `width NULL`
- `height NULL`
- `depth NULL`
- `created_at`

### `viewer_manifests`
Logical manifest records for the viewer to boot quickly.

**Key columns**
- `id UUID PK`
- `module_version_id UUID FK`
- `display_set_id UUID FK`
- `manifest_json JSONB`
- `schema_version`
- `created_at`

---

## 16.6 Annotation system

### `annotation_sets`
Annotations belong to a module version and optionally to a specific display set.

**Key columns**
- `id UUID PK`
- `module_version_id UUID FK`
- `display_set_id UUID NULL`
- `language_code`
- `state`                           # draft / approved / published
- `created_by_user_id`
- `created_at`
- `updated_at`

### `annotations`
One record per logical annotation.

**Key columns**
- `id UUID PK`
- `annotation_set_id UUID FK`
- `structure_id UUID FK NULL`
- `annotation_type`                 # point / polyline / polygon / label / region
- `title_override NULL`
- `short_description_override NULL`
- `visibility_scope`
- `sort_order`
- `created_by_user_id`
- `created_at`
- `updated_at`

### `annotation_geometries`
Stores canonical geometry.

**Key columns**
- `id UUID PK`
- `annotation_id UUID FK`
- `frame_of_reference_uid TEXT NULL`
- `referenced_image_id TEXT NULL`
- `series_id UUID NULL`
- `geometry_json JSONB`             # world-space points / handles / tool data
- `slice_index_hint INT NULL`
- `view_plane_normal JSONB NULL`
- `view_up JSONB NULL`
- `created_at`

### `annotation_presentations`
Optional rendering hints for educational label placement.

**Key columns**
- `id UUID PK`
- `annotation_id UUID FK`
- `placement_mode`
- `label_anchor_norm_x NULL`
- `label_anchor_norm_y NULL`
- `text_box_norm_x NULL`
- `text_box_norm_y NULL`
- `leader_style`
- `color_token`
- `is_pinned_default BOOLEAN`

This is where normalized 2D coordinates belong — as presentation hints, not the sole truth.

---

## 16.7 Learning-state tables

### `user_progress`
Tracks learning state per user and module version.

### `user_bookmarks`
Saved structures, slices, or modules.

### `recent_views`
Useful for “continue learning”.

### `saved_view_presets`
Stores student preference:
- hidden categories
- last selected weighting
- last slice
- dark mode / overlay opacity style
- optional custom presets later

### `user_notes`
Optional future table.

---

## 16.8 Future-ready premium / billing schema

Even if billing is not enabled in MVP, create the tables now or plan them explicitly so the rest of the schema does not paint you into a corner.

### `products`
Business sellable unit.

Examples:
- Brain MRI Atlas Premium
- Full Neuro Bundle
- Institution Annual License
- Student Pro

### `prices`
Supports later pricing evolution without mutating products.

### `payment_customers`
Stores payment-provider linkage.

**Key columns**
- `id UUID PK`
- `account_id UUID FK`
- `provider_code`
- `provider_customer_id`
- `created_at`

### `subscriptions`
Tied to account, not just user.

**Why**
Institution or team access later becomes natural.

### `subscription_items`
Links a subscription to one or more prices/products.

### `orders`
For one-time purchases if you add them later.

### `entitlements`
This is the most important access table.

Do not hardcode premium access as only booleans.

**Columns**
- `id UUID PK`
- `account_id UUID FK`
- `scope_type`                      # module / collection / plan / region / feature
- `scope_id UUID NULL`
- `source_type`                     # purchase / subscription / admin_grant / promo / institution
- `starts_at`
- `ends_at NULL`
- `status`
- `metadata JSONB`

### `module_access_policies`
Maps a module or module version to required access.

Examples:
- public
- authenticated
- premium entitlement
- institution-only
- preview-only

This keeps premium logic flexible.

---

## 16.9 Operations tables

### `ingest_jobs`
Tracks ingestion lifecycle.

**Statuses**
- uploaded
- queued
- validating
- needs_review
- deriving
- failed
- ready_for_edit
- cancelled

### `ingest_job_attempts`
For retries and diagnostics.

### `webhook_deliveries`
Track outbound webhooks.

### `outbox_events`
For reliable async processing and integrations later.

### `background_tasks`
Optional generic scheduler state.

---

## 17) Premium-ready design without turning it on now

You asked specifically to make the schema future-proof for:
- customers
- payments
- premium modules

This is the right way to do it.

## 17.1 Do not use only `is_premium`
A boolean is too weak.

Instead use:
- `module_access_policies`
- `products`
- `prices`
- `entitlements`

That lets one module be:
- free for all
- free preview + premium full
- included in a personal subscription
- included in an institution plan
- unlocked by a one-time purchase
- granted manually to reviewers/editors

## 17.2 Tie commercial ownership to `account`
Later:
- a single student pays personally
- a university pays for a department
- a publisher account owns content
- an institution account licenses it

All of that works cleanly if access and billing attach to `account`.

## 17.3 Keep access resolution in one place
Build one Rust service/module that answers:

> “Can this user access this module version and this feature?”

Inputs:
- user id
- active account id
- module version
- feature code

Outputs:
- allow / deny
- reason
- entitlement source
- upsell hint

Do not scatter premium logic through the UI.

---

## 18) Recommended table relationships

```text
users
  └─< account_memberships >─ accounts
                               ├─ modules
                               │    └─ module_versions
                               │         ├─ published_releases
                               │         ├─ series_variants
                               │         ├─ display_sets
                               │         ├─ annotation_sets
                               │         ├─ derived_assets
                               │         └─ viewer_manifests
                               │
                               ├─ payment_customers
                               ├─ subscriptions
                               ├─ entitlements
                               └─ audit_logs

modules
  └─ module_versions
        ├─ series_variants ── series ── studies
        ├─ annotation_sets ── annotations ── annotation_geometries
        └─ module_access_policies

structures
  ├─ structure_content_versions
  └─ structure_relations

users
  ├─ user_progress
  ├─ user_bookmarks
  ├─ recent_views
  └─ saved_view_presets
```

---

## 19) Search design

## 19.1 What to search
You need search across:
- modules
- structure names
- latin names
- synonyms
- descriptions
- region and modality filters

## 19.2 MVP recommendation
Use PostgreSQL full-text search first.

**Why**
- simpler operations
- enough for MVP
- strong enough for anatomy term search if indexed correctly

## 19.3 Schema recommendation
Use dedicated search columns or generated columns for:
- normalized display title
- normalized synonyms
- description search text

You can later add:
- trigram search for typo tolerance
- ranking weights
- external search engine only if needed

---

## 20) Partitioning and large-table strategy

Do **not** partition everything.

Use partitioning only when growth demands it.

### Strong partition candidates later
- `audit_logs`
- `webhook_deliveries`
- `outbox_events`
- `recent_views`
- `user_progress_events` if you add event-style telemetry
- `ingest_job_attempts`

### Probably do not partition early
- `modules`
- `module_versions`
- `structures`
- `annotations`
- `series`

Keep those relational and indexed normally unless proven otherwise.

---

## 21) Recommended indexing strategy

### Core uniqueness
- `modules.slug UNIQUE`
- `accounts.slug UNIQUE`
- `products.code UNIQUE`
- `series_variants(module_version_id, variant_code) UNIQUE`

### Frequent list queries
- `module_versions(module_id, state, created_at DESC)`
- `published_releases(module_id, is_current)`
- `annotations(annotation_set_id, sort_order)`
- `account_memberships(account_id, role_code, status)`

### Search
- GIN or equivalent full-text index on structure search doc
- GIN or equivalent full-text index on module search doc

### Viewer / authoring lookups
- `series_variants(module_version_id, sort_order)`
- `display_set_items(display_set_id, sort_order)`
- `annotation_geometries(annotation_id)`

### Premium access
- `entitlements(account_id, status, starts_at, ends_at)`
- `module_access_policies(module_id, module_version_id)`

---

## 22) JSONB usage — where it is good and where it is bad

## Good places for JSONB
- raw DICOM metadata shadow
- viewer manifest payload
- audit metadata
- webhook payloads
- configuration blobs that are versioned and not frequently joined
- educational overlay style presets
- search synonyms if later normalized elsewhere too

## Bad places for JSONB
- core ownership relations
- memberships
- subscriptions
- products
- modules
- structures
- annotation identity

Use JSONB as an extension point, not as a replacement for relational design.

---

## 23) Admin workflow — final product flow

## 23.1 Upload flow
1. Admin creates module draft
2. Admin uploads source folder
3. Job validates and derives
4. Draft becomes editable

## 23.2 Authoring flow
1. Editor selects series variant
2. Editor places annotations
3. Editor links annotation to structure
4. Editor sets short tooltip
5. Editor links full structure content
6. Editor previews student experience

## 23.3 Review flow
1. Reviewer checks imaging quality
2. Reviewer checks annotation placement
3. Reviewer checks descriptions
4. Reviewer approves or sends back

## 23.4 Publish flow
1. Publish immutable module version
2. Generate release record
3. Invalidate caches
4. Keep old published version available for rollback

---

## 24) Viewer loading strategy — final recommendation

## 24.1 Boot sequence
1. SSR page shell
2. fetch viewer manifest
3. initialize Cornerstone
4. open default viewport(s)
5. fetch annotation set and structure summaries
6. lazy-load long descriptions only on click

## 24.2 Why this is best
- fast first paint
- minimal blocking payload
- smooth interaction
- long educational text does not delay viewport readiness

## 24.3 Caching strategy
### Browser
- memory cache for currently active viewports
- IndexedDB for revisit acceleration if needed
- separate cache buckets for thumbnails vs manifests

### Server
- Redis for hot manifests and access-resolution cache
- HTTP cache headers for immutable derived assets
- versioned asset keys for publish-safe caching

---

## 25) Nginx / deployment recommendation

## 25.1 Single VPS production shape
- Nginx in Docker
- Next.js in Docker
- Rust API in Docker
- Rust worker in Docker
- Redis in Docker
- PostgreSQL on host
- assets on host-mounted directories

## 25.2 Host directories
Prefer explicit host paths such as:

```text
/srv/anatomy/source/
/srv/anatomy/derived/
/srv/anatomy/thumbs/
/srv/anatomy/backups/
```

instead of relying only on opaque Docker volumes.

**Why**
- easier backup
- easier migration
- easier inspection
- easier restore testing

---

## 26) Suggested schema rollout plan

## Phase 1 — MVP core
Create:
- users
- accounts
- account_memberships
- body_regions
- modalities
- modules
- module_versions
- published_releases
- structures
- structure_categories
- structure_content_versions
- studies
- series
- series_variants
- display_sets
- display_set_items
- source_assets
- derived_assets
- viewer_manifests
- annotation_sets
- annotations
- annotation_geometries
- annotation_presentations
- ingest_jobs
- audit_logs

## Phase 2 — learning state
Add:
- user_progress
- user_bookmarks
- recent_views
- saved_view_presets

## Phase 3 — premium/business ready
Add:
- products
- prices
- payment_customers
- subscriptions
- subscription_items
- entitlements
- module_access_policies

## Phase 4 — organization/institution scale
Add or activate:
- institution accounts
- seat assignment logic
- reviewer queues
- advanced audit and approval states
- organization or team integration

---

## 27) Recommended business roles from day one

Even if you do not expose all of them yet, design for them.

### Suggested roles
- `owner`
- `platform_admin`
- `content_admin`
- `editor`
- `reviewer`
- `translator`
- `support`
- `student`

### Why this matters
Because many future features depend on role clarity:
- who can upload?
- who can publish?
- who can edit structures?
- who can approve premium content?
- who can assign institutional access?

---

## 28) What not to do

### Do not
- tie premium access directly to `user` only
- rely on `is_premium BOOLEAN` everywhere
- store annotation truth only as 2D normalized screen coordinates
- process all heavy ingestion inside the request path
- edit published modules in place
- use auth tables as your only business-ownership model
- let the frontend directly decide access control
- mix raw DICOM source with student-facing publish artifacts

---

## 29) Final recommendation for Better Auth + future organizations

You currently use Better Auth.

That is fine.

### Recommendation
- keep Better Auth for authentication/session lifecycle
- keep your business ownership in `accounts`
- later, if you enable Better Auth’s organization plugin, either:
  - map `organization.id` to `accounts.auth_organization_id`
  - or create accounts first and synchronize organization state into them

### Why this is better
It avoids hard-locking your business model to auth-provider tables.

Your billing, entitlements, publisher ownership, and institution logic should live in **your** business schema.

---

## 30) Final “what, why, how” summary

## What
A production-grade anatomy learning platform with:
- versioned content
- admin authoring
- high-performance medical-image viewer
- future-ready account/billing schema

## Why
Because your product is not merely a viewer.
It is a **learning platform**, and learning platforms succeed through:
- stable content publishing
- scalable content operations
- clean access control
- smooth UX
- future business flexibility

## How
- Next.js for SSR catalogue and admin shell
- Rust/Axum for APIs, ingestion, publishing, search, and real-time
- PostgreSQL as source of truth
- Redis for cache and job coordination
- Cornerstone3D v4 for viewer/rendering foundation
- account-first, version-first, entitlement-first schema design

---

## 31) Final architecture decision list

## Keep
- Rust as DDL owner
- Next.js App Router
- PostgreSQL on host
- Redis in Docker
- Nginx reverse proxy
- Rust + Next separation
- derived viewer assets
- SSR catalogue

## Change
- move from custom viewer core to Cornerstone3D core
- move from normalized 2D label truth to world-coordinate truth
- move from synchronous upload processing to background ingestion
- add immutable publish versions
- add account-first schema now
- add future-ready entitlement/billing tables now or in Phase 3 with clean placeholders
- separate source assets from derived assets

---

## 32) Immediate next steps

1. Freeze the business/domain vocabulary  
2. Write the first Rust migration set around the new schema  
3. Decide final account model (`personal` + future `institution`)  
4. Implement `modules`, `module_versions`, `published_releases` first  
5. Implement imaging ingestion tables next  
6. Implement structure library and annotation tables next  
7. Integrate Cornerstone3D v4 in an isolated viewer prototype  
8. Add publish workflow before building too much admin polish  
9. Add access policy / entitlements before premium launch  
10. Only then add payments

---

## 33) Reference implementation notes for your stack

### Next.js
Use App Router default server components for public pages and admin shells. Keep the imaging viewer in a client boundary.

### Rust
Use Axum for:
- APIs
- ingestion orchestration
- publish workflow
- access-resolution service
- webhook delivery

### PostgreSQL
Use it as:
- content store
- business state store
- access state store
- search source
- audit source

### Redis
Use it as:
- short-lived cache
- queue coordination
- real-time room state
- rate-limit backend

---

## 34) Recommended docs folder inside your repo

```text
docs/
├─ architecture/
│  ├─ 01-system-overview.md
│  ├─ 02-viewer-architecture.md
│  ├─ 03-ingest-pipeline.md
│  └─ 04-publish-workflow.md
├─ schema/
│  ├─ 01-domain-model.md
│  ├─ 02-core-tables.md
│  ├─ 03-annotation-model.md
│  ├─ 04-access-billing-future.md
│  └─ 05-indexing-and-partitioning.md
├─ operations/
│  ├─ backups.md
│  ├─ restore-drill.md
│  ├─ worker-retries.md
│  └─ publish-rollback.md
└─ viewer/
   ├─ cornerstone-integration.md
   ├─ annotation-mapping.md
   └─ manifests.md
```

---

## 35) Final answer in one paragraph

The best long-term architecture for your platform is a **versioned anatomy-content system** built on **Next.js + Rust + PostgreSQL**, where **Cornerstone3D v4** provides the imaging/rendering foundation, **Rust owns schema and ingestion**, **published module versions are immutable**, **annotations are stored in world/image-space rather than only screen coordinates**, and the database is designed around **accounts + entitlements** so future customers, subscriptions, payments, and premium modules can be added cleanly without redesigning the core domain.

---

## 36) Sources and references

These were the main external references used to shape the recommendations:

1. Cornerstone.js Docs — 4.0 Migration Guides  
   https://www.cornerstonejs.org/docs/migration-guides/4x/

2. Cornerstone.js Docs — Viewports  
   https://www.cornerstonejs.org/docs/concepts/cornerstone-core/viewports

3. Cornerstone.js Docs — BaseVolumeViewport / Volume viewport concepts  
   https://www.cornerstonejs.org/docs/api/core/classes/basevolumeviewport/

4. Cornerstone.js Docs — Annotation State  
   https://www.cornerstonejs.org/docs/concepts/cornerstone-tools/annotation/state

5. Cornerstone.js Docs — Viewport Reference and Presentation  
   https://www.cornerstonejs.org/docs/concepts/cornerstone-core/viewportreferencepresentation/

6. Cornerstone.js Docs — VoxelManager  
   https://www.cornerstonejs.org/docs/concepts/cornerstone-core/voxelManager

7. Better Auth — Organization plugin  
   https://www.better-auth.com/docs/plugins/organization

8. Next.js Docs — App Router  
   https://nextjs.org/docs/app

9. Next.js Docs — Server and Client Components  
   https://nextjs.org/docs/app/getting-started/server-and-client-components

10. OHIF Docs — Hanging Protocol Service  
    https://docs.ohif.org/platform/services/data/hangingprotocolservice/

11. DICOM PS3.15 — Security and System Management Profiles  
    https://dicom.nema.org/medical/dicom/current/output/html/part15.html

12. DICOM PS3.15 — Basic Application Level Confidentiality Profile  
    https://dicom.nema.org/medical/dicom/current/output/chtml/part15/sect_E.2.html

13. PostgreSQL 16 — Generated Columns  
    https://www.postgresql.org/docs/16/ddl-generated-columns.html

14. PostgreSQL 16 — Row Security Policies  
    https://www.postgresql.org/docs/16/ddl-rowsecurity.html

15. PostgreSQL Docs — Table Partitioning  
    https://www.postgresql.org/docs/current/ddl-partitioning.html

---

## 37) Notes based on your current draft

This final structure intentionally improves several parts of the current draft, especially:
- custom viewer-first design
- normalized label coordinates as core truth
- upload-time heavy derivation
- missing immutable publishing workflow
- missing future-ready account / entitlement layer
- under-modeled product growth toward premium and customer support

It keeps the strong parts:
- Rust migration ownership
- Next.js + Rust split
- PostgreSQL + Redis foundation
- attention to image quality
- clear admin vs student product separation