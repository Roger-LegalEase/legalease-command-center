# Files release-train integration manifest

Base: `3e660e165a9f31d0d1f50305ec51f89359ca417c`

This branch is additive. It intentionally does not edit shared shell, routing,
role, server-composition, package, global-CSS, or browser-fixture files.

## CCX-601 wiring

- Import `readFilesHome` from `scripts/ui-api/files-read.mjs`.
- Register authorized compact read `GET /api/ui/files` with `read_internal`.
- Supply a server-only cursor secret of at least 16 characters; never return it.
- Render `renderFilesLoading()` and `renderFilesHome(payload)` from
  `scripts/ui/pages/files-home.mjs` for canonical `#files`.
- Include `/assets/ui/files-home.css` after shared tokens.
- Register `filesHomeBrowserSource()` from
  `scripts/ui/controllers/files-home-controller.mjs` once in the vNext client.
- Preserve aliases `#proof`, `#data-room`, `#dataroom`, `#evidence-room`,
  `#reports`, `#assets`, `#metrics`, and `#kpis`; direct them to the relevant
  Files collection while exact links remain
  `#files/<source-kind>/<encoded-id>` through the vetted parser.
- Gate all Files wiring with server flag `COMMAND_CENTER_UX_VNEXT_FILES`; flag
  off retains the current legacy renderers and aliases.
- Package script to add: `test:vnext-files-home` →
  `node scripts/test-vnext-files-home.mjs`.

Further packet wiring is appended by CCX-602 through CCX-607.

## CCX-602 wiring

- Import `readFileDetails` from `scripts/ui-api/file-details-read.mjs` for
  `GET /api/ui/files/:sourceKind/:sourceId`; require `read_internal` and pass
  route values through the existing vetted parser before lookup.
- Add an authorized, bounded content handler at
  `GET /api/ui/files/:sourceKind/:sourceId/content`. It must resolve storage only
  after the same File read succeeds, set safe content headers, cap text previews
  at 200 KB, and never return local paths, unsigned private URLs, or secrets.
- Render `renderFileDetails` for exact File routes and register
  `fileDetailsBrowserSource()` only on that page.
- Include `/assets/ui/file-details.css` after shared tokens.
- Package script: `test:vnext-file-details` →
  `node scripts/test-vnext-file-details.mjs`.

## CCX-603 wiring

- Compose `createFilesUploadService` from
  `scripts/ui-actions/files-upload.mjs` with the existing scoped store
  (`readState` plus `writeCollections`) and one storage adapter from
  `scripts/files-storage-adapter.mjs`.
- Hosted mode must construct `createSupabaseFilesStorage` with server-only
  Supabase credentials and a private bucket. Local/demo mode must construct
  `createLocalFilesStorage` beneath an explicit app-owned data directory.
- Register `POST /api/ui/files/upload` and
  `POST /api/ui/files/:sourceKind/:sourceId/replace` with `manage_growth`, CSRF,
  origin, multipart byte, and request-size enforcement. Replacement is limited
  to authoritative `dataRoomItems` uploads.
- Render `renderFileUploadDialog`, register `fileUploadBrowserSource`, and include
  `/assets/ui/file-upload.css`. Add a visible `data-files-upload` action inside
  the Files New menu; do not bypass the existing Global Create fallback.
- Package script: `test:vnext-files-upload` →
  `node scripts/test-vnext-files-upload.mjs`.

## CCX-604 wiring

- Import `readInvestorRoom` from `scripts/ui-api/investor-room-read.mjs` for
  `GET /api/ui/files/investor-room`; require `read_internal`.
- Supply the reviewed explicit requirement configuration and the server clock.
  Do not derive requirements by filename/title and do not persist a second copy
  of a File. With no reviewed configuration, expose readiness as unavailable.
- Render `renderInvestorRoom` for `#files?collection=investor-room` and include
  `/assets/ui/investor-room.css`.
- Package script: `test:vnext-investor-room` →
  `node scripts/test-vnext-investor-room.mjs`.

## CCX-605 wiring

- Compose `createFilesReportService` from
  `scripts/ui-actions/files-reports.mjs` with the current reviewed report
  generator and scoped store ports. The generator must persist and return one
  stable authoritative report record before the adapter resolves its FileView.
- Register `POST /api/ui/files/reports/generate` and
  `POST /api/ui/files/reports/:id/collection` with `manage_growth`, CSRF/origin,
  idempotency, and current-record checks.
- Render `renderFilesReportActions` in Files New and register
  `filesReportBrowserSource`. No separate report destination is required.
- Package script: `test:vnext-files-reports` →
  `node scripts/test-vnext-files-reports.mjs`.

## CCX-606 wiring

- Compose `createFilesSharingService` from
  `scripts/ui-actions/files-sharing.mjs` with the scoped store ports.
- Register `POST /api/ui/files/:sourceKind/:sourceId/access/grant` and
  `/access/revoke` with `manage_roles`, CSRF/origin, current-record, and
  idempotency enforcement. Never infer public access from storage metadata.
- Render `renderFileSharingControls` inside the Sharing tab only when the server
  grants `manage_roles`; register `fileSharingBrowserSource` on that page.
- Expiring/public links remain disabled because the current model has no reviewed
  authority for them.
- Package script: `test:vnext-files-sharing` →
  `node scripts/test-vnext-files-sharing.mjs`.

## CCX-607 and final integration

### Imports and endpoints

- Add `createFilesOrganizationService` and register scoped, idempotent
  `POST /api/ui/files/:sourceKind/:sourceId/organize` with `manage_growth`.
  Supported actions are star/unstar, move between reviewed collections,
  trash/restore, and exact Partner/Campaign/Post relation. It never creates a
  folder copy.
- All read, upload, report, organization, and access imports/endpoints are listed
  in the packet sections above. Reads require `read_internal`; writes retain the
  stronger action-specific capabilities, CSRF/origin checks, current-state
  lookup, and scoped collection persistence.

### Rendering, controllers, and CSS

- Register Files home, exact detail, Investor Room, upload, report, organization,
  and sharing renderers/controllers only while
  `COMMAND_CENTER_UX_VNEXT_FILES=true`.
- Stylesheets: `/assets/ui/files-home.css`, `/assets/ui/files-organization.css`,
  `/assets/ui/file-details.css`, `/assets/ui/file-upload.css`, and
  `/assets/ui/investor-room.css` after shared tokens.
- Keep all route parsing in the vetted compatibility parser. Preserve exact
  `#files/<source-kind>/<encoded-id>` links and the legacy aliases listed under
  CCX-601. Flag off retains legacy routes and performs no Files API call.

### Package and browser registration

- Add the six packet scripts listed above plus:
  `test:vnext-files-acceptance` →
  `node scripts/test-vnext-files-acceptance.mjs`.
- Include `tests/browser/files-acceptance.spec.mjs` in the focused and full
  browser matrices without changing shared fixture behavior.

### Cross-lane dependencies

- Partner relation uses only the existing exact Partner ID/link contract. No
  Partner adapter is copied or modified.
- Report generation is dependency-injected and must use the currently reviewed
  authoritative generator selected by Integration.
- Investor Room requirements require a reviewed Integration-owned configuration;
  absence intentionally produces Unavailable readiness.

### Performance and payload budgets

- `GET /api/ui/files`: 24 rows by default, 50 maximum, target under 250 KB and
  p95 under 750 ms in hosted mode.
- Exact detail/Investor Room: target under 150 KB and p95 under 750 ms.
- Content preview: text capped at 200 KB; binary content streams without entering
  page JSON. Multipart upload maximum is 25 MB.
- No endpoint returns full company state, raw source records, credentials, public
  storage URLs, or provider payloads.

### Rollback

- Disable `COMMAND_CENTER_UX_VNEXT_FILES` to restore legacy renderers and stop all
  new Files endpoint/controller composition.
- Remove the additive modules, styles, tests, docs, and endpoint registrations.
  Uploaded `dataRoomItems`, authoritative reports, activity, and audit records
  remain valid existing-source data and must not be deleted during UI rollback.
