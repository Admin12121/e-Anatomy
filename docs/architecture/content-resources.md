# Content resources implementation

Approved scope: modality-family and label articles, a public three-column structures surface, and a route-based admin resources workspace. Interactive viewer labels stay on the main MPR plane. No changes to the staged annotation card, no commits, no host servers.

## Decisions

- Families are editorial topics; variants remain technical viewers. A stored primary variant owns the initial public label tree. Cross-variant anatomical deduplication is deliberately deferred.
- Family slugs are stable and globally unique so `/content/<slug>` is unambiguous. Name changes do not change URLs. Existing variant-slug links remain aliases.
- Draft saves preserve a separate published snapshot, including resources. Publishing is explicit and revision checked. Existing label descriptions migrate to drafts; private modality notes never become public articles.
- Native BlockNote JSON is canonical for new documents. Legacy Markdown is retained for migration and converted on editing. Existing Markdown writers keep their default behavior.
- Public routes expose published, free snapshots only. Subscription content is not unlocked by a client-side check.
- Label publication mirrors only free published content to the existing viewer description panel. Subscription publication and unpublishing clear that mirror. Anonymous viewer responses also redact private descriptions and learning points. Draft edits never alter the live viewer description.
- Canonical family URLs take precedence over technical-variant aliases. Missing primary selections use the same ready/creation/id ordering in the API and the web catalog.
- Save responses belong to the saving transaction, and the editor is locked while saving. Revision conflicts require reloading rather than silently overwriting another editor.
- This phase is free-only. The native editor saves free-access documents without access/subscription controls; premium management is deferred. Existing summary/resource metadata is retained, not cleared when its forms are removed.
- The existing anatomy model is loaded only when the reader requests its preview; this phase does not invent a Brain-specific GLB.

## Verification and rollout

The current source review covers routing, publication access, transaction responses and editor save handling. Focused catalog/document/analytics tests and frontend syntax checks are runnable without installing dependencies. Rust compilation is currently blocked by uncached `axum-extra v0.12.5`; host frontend dependencies are also absent, so no full typecheck/build or browser verification is claimed. No Docker containers or host servers were started, and no changes were committed or staged.

Latest checks: **12 focused tests passed** (29 assertions); the content/analytics data-helper typecheck reported **0 diagnostics**; **33 changed frontend files** parsed with no syntax failures; the changed Rust files parsed, the new content module passed formatting checks, and `git diff --check` passed. The independent source review was rerun after correcting publication access, save-state handling and canonical routing, with no remaining findings in that focused scope. These results do not substitute for applying the migration or running the full application build.

Apply `services/api/migrations/202609300001_content_documents.sql` through the normal API migration startup before using the new routes. Existing descriptions become drafts, not automatically published articles.

### Manual acceptance checks

1. Open `/content/<family-slug>/resources`. Only the modality article appears in the searchable, status-filtered table. Open it to navigate region → modality → labels in the editor sidebar; no primary-viewer setting is shown.
2. Edit the full-page document using headings, nested lists, tables and other native blocks. Save with the header icon, reload, and check formatting and existing metadata remain intact. There are no separate description, media/reference or access forms.
3. Open the compact publication-status menu in the editor header to explicitly publish the modality article and a label. Use **View published** in that menu to review the three-column public page, module link and on-demand anatomy model.
4. Edit and save a draft without publishing; the public snapshot and viewer description must stay unchanged. Check conflicting saves from two editor sessions.
5. Confirm saves/publishes use free access in this phase. Unpublish a free label from the header menu and confirm its public article and mirrored description disappear. Subscription controls are deferred; backend safeguards still prevent exposing older subscription snapshots.
6. Review both themes, mobile tree expansion, keyboard focus, long text wrapping, and navigation with unsaved edits. Click navigation and full-page unload have confirmation; browser history navigation is not yet intercepted.

### Content workspace UI revision (October 1)

- Adapted the supplied interactive Recharts example to actual daily views and engaged views. Countries and traffic sources use horizontal charts. Engagement opens the engaged-view trend instead of variant-status and raw-event tables. Missing dates have zero-count bars, and an empty report remains an explicit empty state. No rates or dwell times are inferred from incomplete event samples.
- Adapted the supplied nested sidebar to the local UI primitives. The main desktop rail collapses once, while the nested rail has independent state, no shared cookie writes and no duplicate keyboard shortcut. Mobile uses a compact rail and a navigation sheet.
- Reports and Resources have five peer links, with no duplicate content header or permanently expanded resource tree. Resources is a modality-only table with search, publication-status filtering and URL-backed pagination. Labels are not table rows, and primary-viewer settings are removed.
- All four content reports use the existing component Select with items known before hydration. Changing the reporting period navigates immediately, preserves the current report route, and resets pagination through the shared analytics URL helper. There is no Apply button. The pattern follows the [coss Select example](https://github.com/cosscom/coss/blob/main/apps/ui/registry/default/particles/p-select-1.tsx) and the installed Next 16.2.1 router guide.
- Article routes replace the report rail with a searchable region → modality → labels tree. The selected label's technical variant controls its sibling tree; the modality article uses the primary variant.
- The native document editor fills the available workspace, with a single scrolling document canvas and its own compact header. The icon saves drafts; the compact publication-status menu provides explicit publish/unpublish and published-preview actions. Separate description, access and resource forms are removed. Save input preserves existing metadata and revision checks while using free access. These scoped styles do not change other rich-text editors.

Revision checks: **18 focused tests passed** (51 assertions). The 11 changed TypeScript files passed syntax and scoped semantic checks using the existing package cache; this is not a full application build. Formatting and whitespace checks passed. Package/lockfile updates add Recharts and its matching React compatibility package only; no host dependencies were installed, no services were started, and staged annotation-card work was preserved.

Additional acceptance: switch Views/Engaged views, hover and keyboard-focus chart bars, filter/search/page the Resources catalog, open modality and non-primary label articles, collapse/expand both rails, and review the article header/save state in both themes and mobile. Live browser layout and full integration verification remain pending.

Latest simplification checks: **29 focused tests passed** (72 assertions), including immediate-period URL handling, modality search/status/pagination, metadata preservation, free save input and explicit publication. **9 changed TypeScript files** passed syntax and scoped semantic checks using cached dependencies. There are **11 transitive diagnostics** outside those scoped files; this is not a full application typecheck/build. No dependencies were installed and no containers or host servers were started/restarted. Staged annotation-card changes remain untouched.

### Follow-up scope

- Canonical label identity across technical variants; currently the public tree uses only the chosen primary variant.
- Subscription entitlements; subscription articles intentionally remain private for now.
- Study-specific 3D assets and an interactive custom-model resource renderer. The current model is explicitly a reference preview.
- Server-rendered native document body, revision-history browsing, and browser-back protection for unsaved changes. The current body reuses the existing client-side BlockNote viewer; title, summary, navigation and metadata render on the server.
