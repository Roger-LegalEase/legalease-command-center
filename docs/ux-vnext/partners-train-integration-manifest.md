# Partners release-train integration manifest

Status: additive domain implementation for CCX-501, CCX-502, CCX-504, CCX-505, and CCX-506. Integration owns every reserved-file change listed below. Do not merge this train directly to `main`.

## 1. New server imports

- `buildAuthorizedPartnersHome` and `PartnersHomeValidationError` from `scripts/partners-home-service.mjs`.
- `buildPartnerRecordView` from `scripts/ui/view-models/partner-record.mjs` (or a thin authorized Partner-record service wrapper).
- Scoped reducers from `scripts/partner-record-actions.mjs`.
- Selection, Campaign draft, follow-up, relationship, and reviewed-stage functions from `scripts/partner-outreach-integration.mjs`.
- Program, artifact, add-file, and Partner Files functions from `scripts/partner-artifact-service.mjs`.

## 2. Compact Partner read endpoints

- `GET /api/ui/partners`: `read_internal`; one state read; `view`, `search`, `stage`, `owner`, `health`, `limit`, and opaque `cursor`; target under 250 KB and 250 ms.
- `GET /api/ui/partners/:encoded-id`: `read_internal`; one state read; optional reviewed `tab`; target under 150 KB and 250 ms.
- `GET /api/ui/partners/:encoded-id/outreach`: `read_internal`; compact Campaign relationships and reviewed suggestions only.
- `GET /api/ui/partners/:encoded-id/files`: `read_internal`; File projection output only.
- Reject unknown query fields, malformed IDs/cursors, and flag-off requests before state access. Never return `/api/state` or raw source collections.

## 3. Scoped Partner action endpoints

- `POST /api/ui/partners/:id/activity` (`add_notes`).
- `POST /api/ui/partners/:id/next-action` and `/next-action/complete` (`manage_tasks`).
- `POST /api/ui/partners/outreach/selection` (`read_internal`, read-only).
- `POST /api/ui/partners/outreach/campaign` (`manage_growth`, canonical Draft only).
- `POST /api/ui/partners/:id/outreach/follow-up` (`manage_growth`, draft-only read contract).
- `POST /api/ui/partners/:id/stage-suggestions/:suggestionId/apply` (`manage_growth`, explicit confirmation).
- `POST /api/ui/partners/:id/programs`, `/programs/:programId/artifacts`, and `/files` (`manage_growth`).

Every mutation requires bounded JSON, CSRF/session enforcement, exact server-resolved identity, idempotency/request ID, current-state authorization and relationship revalidation, one scoped state transaction, and bounded activity/audit evidence. Never accept a collection name, generic patch, execution flag, external-sharing flag, or stage value from the browser.

## 4. Route and alias requirements

- Canonical home: `#partners`; exact record: `#partners/partner/<encoded-id>`; preserve existing `#partner` and `#partner-hub` aliases.
- Keep exact Campaign links `#outreach/campaign/<encoded-id>` and exact File links emitted by their merged projections.
- Resolve `#partner-programs`, `#partner-pages`, `#partner-dashboards`, `#partner-reports`, and `#partner-proposals` into the relevant exact Partner context only when a reviewed stable Partner ID exists. Otherwise retain the legacy fallback.
- Preserve legacy rollback and unsafe-route fail-closed behavior.

## 5. Partner page/controller registration

- Register `partnersHomePageHtml`/`partnersHomeBrowserSource` for canonical Partners home.
- Register `partnerRecordPageHtml` plus a focused Partner-record controller for exact Partner routes and tab query state.
- The controller must deduplicate active reads, abort stale navigation safely, restore filters/tabs on Back/Forward, manage focus and live announcements, and never derive authorization from the browser.
- Global Create opens through `window.__LE_GLOBAL_CREATE.openWorkflow`; do not copy its forms or service.

## 6. CSS registrations

Add page-specific links for `/assets/ui/partners-home.css`, `/assets/ui/partner-record.css`, `/assets/ui/partner-outreach.css`, `/assets/ui/partner-artifacts.css`, and `/assets/ui/partners-accessibility.css`. Do not merge them into shared/global CSS or tokens.

## 7. Feature flags

Use the existing global `COMMAND_CENTER_UX_VNEXT` composition. Flag off returns 404 before compact endpoint state access and leaves all legacy Partner routes/actions intact. No browser flag grants authority.

## 8. Package scripts

Register direct Node scripts:

- `test:vnext-partners-home`
- `test:vnext-partner-record`
- `test:vnext-partner-outreach-integration`
- `test:vnext-partner-artifacts`
- `test:vnext-partner-acceptance`
- optional `capture:vnext-partners-train`

Add changed JavaScript modules to the syntax gate. Integration owns `package.json`.

## 9. Browser specs

Include `tests/browser/partners-train.spec.mjs` in normal discovery. Replace the self-contained visual fixture with the shared deterministic server fixture only after endpoint/shell wiring exists; retain its exact-link, zero-side-effect, history, accessibility, state, and width assertions.

## 10. Lane A Outreach integration points

Consume `createPartnerCampaignDraft` at Lane A's reviewed selected-Partner Campaign draft boundary. Lane A's currently available manifest documents CCX-401 through CCX-403 but not a selected-Partners interface, so this train intentionally imports no private Lane A path. Pass canonical Partner IDs/source references; Lane A must preserve server revalidation, suppression, approval, and send-authority gates. Opening Create outreach never sends or enrolls.

## 11. Lane C Files integration points

Render `buildPartnerFilesView` output and its exact File links. A generated artifact remains authoritative in `partnerProgramArtifacts`; the `reports` row is metadata-only and contains no copied document. Lane C should not infer public/shared/uploaded truth from generation. Add file remains Global Create metadata until a separately reviewed upload exists.

## 12. Rollback

Disable the global vNext flag, remove only manifest-listed endpoint/controller/stylesheet/script registrations, and revert the five packet commits in reverse order. No schema, migration, binary move, Campaign copy, File copy, or lifecycle consolidation requires data rollback. Existing legacy routes and source collections remain authoritative.

## 13. Payload and performance expectations

- Partners home default 24/max 50; under 250 KB and 250 ms.
- Partner detail under 150 KB and 250 ms.
- Exactly one active compact request per surface; zero post-boot full-state reads on Partners routes.
- Opening/rendering: zero writes, provider calls, sends, enrollments, approvals, schedules, uploads, shares, or stage changes.
- Writes are bounded to one exact Partner/program/artifact/File transaction plus bounded evidence. No broad full-state browser write.

## Known integration limitations

- Reserved server, shell, routes, role mapping, feature-flag composition, package scripts, and shared fixture wiring are intentionally unmodified.
- Lane A has not yet published its selected-Partners Campaign wizard interface.
- Lane C has not yet published its Files-browser integration interface.
- The visual/browser harness is deterministic and self-contained until Integration registers production-like compact endpoints.
