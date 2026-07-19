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
