# Phase 2 Frontend TODO

## Confirmed product decisions

- [x] Use one privileged role: **Owner/Admin**. Do not create separate Owner and Admin permission sets.
- [x] Support exactly three roles: **Owner/Admin**, **Editor**, and **Viewer**.
- [x] Limit Editor permissions to creating, updating, and deleting content.
- [x] Keep the subscription payment provider and payment flow queued until Stripe versus a local payment system is confirmed.
- [x] Require account verification before a subscription can be activated.
- [x] Capture these analytics events:
  - `page_view`
  - `account_created`
  - `structure_selected`
  - `content_engaged`
  - `subscription_activated`
  - `subscription_canceled`
- [x] Preserve the established Python-reference style exactly.
- [x] Keep the current shared components and existing screens unchanged unless a new feature specifically requires an extension.
- [x] Use the current Frame, Table, pagination, Card, and CardFrame patterns when building new Phase 2 screens.
- [x] Build application screens from the shared UI components instead of native interactive elements.
- [ ] Keep production data isolated from development, migration testing, and UI preview work.

## 0. Development safety and baseline — PAUSED

Do not implement this section during the current frontend phase. It may affect
production-facing bootstrap, database, migration, Docker, or deployment
behaviour.

- [ ] Treat the existing duplicate-account and duplicate-user guards as sufficient for now.
- [ ] Do not change bootstrap or seed behaviour.
- [ ] Do not change Docker or environment configuration.
- [ ] Do not add or change database migrations.
- [ ] Do not change production data, production configuration, or deployment behaviour.
- [ ] Resume this section only after a separate backend review and explicit approval.

## 1. Shared component patterns for new pages

- [x] Treat the current Next shared components as the approved implementation.
- [x] Do not refactor existing Frame, Table, pagination, Card, CardFrame, or existing screen compositions as part of Phase 2.
- [x] Use this standard composition for new paginated data screens:
  - component-based filters
  - `Frame`
  - `Table`
  - `TablePagination`
- [x] Use the existing pagination style and behaviour for new tables, including:
  - visible item-range summary
  - first-page control
  - previous-page control
  - numbered page window
  - ellipsis
  - next-page control
  - last-page control
  - disabled and active states
  - responsive layout
- [x] Use standalone `Card` or `CardFrame` compositions for new dashboard metrics and summary content.
- [x] Use existing shared Button, Input, Select, Dialog, Menu, Tabs, Field, and other UI components in new screens.
- [x] Do not introduce native interactive elements when an approved shared component already exists.
- [x] Use existing screens and the Python reference as composition examples without changing their current implementation.

## 2. Auth and smart session handling

- [ ] Preserve the current email-first smart login flow.
- [ ] Load available sign-in methods only after account identification.
- [ ] Handle password, passkey, email verification, and two-factor states in the same auth flow.
- [x] Preserve the originally requested URL and return the user there after successful authentication.
- [x] Add a centralized authenticated-app boundary.
- [ ] Refresh valid sessions without interrupting the user.
- [x] Trigger re-authentication only when the session is expired or revoked.
- [x] Show a clear session-expired dialog before redirecting to login.
- [x] Prevent repeated auth prompts across simultaneous requests.
- [ ] Revoke the active server session during logout before clearing local state.
- [x] Add a session-management screen with device, approximate location, last activity, current-session marker, and revoke actions.
- [ ] Require recent authentication for password, email, passkey, two-factor, role, and subscription changes.
- [x] Verify protected routes on the server; client-side redirects are only a UX layer.

## 3. Frontend RBAC and capability gating

- [x] Define one frontend role/capability contract aligned with the backend role values.
- [x] Map Owner/Admin to all capabilities:
  - manage users
  - manage finance
  - manage content
  - view analytics
  - manage configuration
- [x] Map Editor to content create, update, and delete capabilities only.
- [x] Map Viewer to read-only viewer capabilities.
- [x] Protect routes with server-side role checks.
- [x] Protect mutations and API calls independently of route visibility.
- [x] Gate buttons, menus, forms, and destructive actions by capability.
- [ ] Show clear locked or read-only states rather than allowing an action to fail after submission.
- [ ] Add unauthorized and insufficient-permission states using the existing application shell.
- [ ] Add RBAC tests for every route and every mutation.

## 4. Admin information architecture

- [x] Replace the placeholder dashboard with the Phase 2 overview.
- [x] Add a Users page using filters, `Frame`, card-style `Table`, and `TablePagination`.
- [x] Add a Content page using the same table composition.
- [ ] Add an Analytics section with overview and event-detail screens. (Overview and event table are complete; event details remain.)
- [x] Add a Sessions page under account/security settings.
- [x] Keep subscription navigation queued or feature-flagged until its implementation is confirmed.
- [x] Ensure Editor navigation only exposes content-management destinations.
- [x] Ensure Viewer navigation is read-only.

## 5. Analytics UI

- [x] Add a global date-range filter.
- [x] Add overview Cards for:
  - visitors
  - referred visitors
  - newcomers
  - active accounts
  - engagement
- [ ] Add comparison values for the previous equivalent period.
- [x] Add referral-source breakdown with an honest no-data state until collection is enabled.
- [x] Add new-versus-returning visitor breakdown with an honest no-data state until collection is enabled.
- [ ] Add account activity and engagement trends.
- [x] Add a paginated event table using `Frame`, `Table`, and `TablePagination`.
- [ ] Filter events by event name, date, account state, content, and referrer.
- [ ] Add event detail panels without exposing sensitive raw identifiers.
- [x] Define the visible meaning and calculation for every metric currently shown.
- [x] Display empty, partial-data, and analytics-disabled states.

## 6. Analytics event integration

- [x] Define a typed client event API for the six confirmed events.
- [x] Define required and optional properties for each event.
- [x] Generate a first-party anonymous visitor ID.
- [ ] Connect anonymous activity to an account only after authentication.
- [x] Preserve the original referrer and current-session referrer separately.
- [x] Deduplicate repeated page views caused by rendering or navigation retries.
- [x] Define the initial engagement threshold as 30 seconds of continuous structure viewing before sending `content_engaged`.
- [ ] Send subscription lifecycle events from confirmed server-side state, not optimistic button clicks.
- [ ] Add consent and retention rules for anonymous analytics.
- [x] Exclude secrets, passwords, tokens, medical uploads, and sensitive free-form text from analytics payloads.

## 7. Rate limiting and verification signals

- [ ] Do not use IP address as the only identity or blocking signal.
- [ ] Use layered rate-limit keys:
  - account or user ID when authenticated
  - stable first-party device ID
  - session ID
  - normalized email or verification target
  - IP subnet as a supporting signal
- [ ] Keep per-device and per-account limits stricter than shared-IP limits.
- [ ] Use IP-wide limits only for extreme abuse so shared Wi-Fi users are not blocked together.
- [ ] Add progressive responses: delay, CAPTCHA/challenge, temporary action lock, then broader block.
- [ ] Rotate or expire device identifiers and provide a privacy disclosure.
- [ ] Never treat a browser fingerprint as proof of identity.
- [ ] Trust forwarded IP headers only from configured trusted proxies.
- [ ] Add rate-limit feedback with retry timing and a recovery path.
- [ ] Test multiple legitimate users behind one NAT/shared Wi-Fi address.

## 8. Subscription work queue

- [x] Keep payment-provider integration unimplemented until the provider decision is confirmed.
- [ ] Define provider-neutral frontend states:
  - no subscription
  - pending verification
  - pending activation
  - active
  - cancellation scheduled
  - canceled
  - past due
- [ ] Define customizable monthly and yearly plan display contracts.
- [ ] Define verification-required UI before activation.
- [ ] Define Owner/Admin plan-management screens without implementing payment processing.
- [ ] Prevent subscription state from being inferred only from client-side state.
- [ ] Add `subscription_activated` and `subscription_canceled` only after backend confirmation.

## 9. Testing and release safety

- [ ] Add visual regression coverage for shared components in light and dark themes.
- [ ] Add responsive coverage for tables, pagination, cards, dialogs, and the application shell.
- [ ] Add keyboard and screen-reader checks for pagination and all auth flows.
- [ ] Add unit tests for capability mapping and analytics payload validation.
- [ ] Add integration tests for login, verification, session expiry, logout, and session revocation.
- [ ] Add end-to-end tests for Owner/Admin, Editor, and Viewer.
- [ ] Add analytics deduplication and anonymous-to-account-linking tests.
- [ ] Add shared-Wi-Fi rate-limit tests.
- [ ] Enable new sections behind feature flags.
- [ ] Keep database migrations, data backfills, and production rollout changes outside this frontend TODO while Section 0 is paused.

## Recommended implementation order

1. Establish the approved shared-component compositions for new Phase 2 pages.
2. Auth and session boundary.
3. RBAC capability contract and guards.
4. Users and Content table foundations with pagination.
5. Analytics event contract and collection.
6. Analytics dashboard and event explorer.
7. Rate-limit and verification UX.
8. Subscription UI contracts while provider selection remains queued.
9. Full regression and accessibility verification for the new frontend work.

Development bootstrap and production-safety changes remain paused and are not
part of this implementation order.
