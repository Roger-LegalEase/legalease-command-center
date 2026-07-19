# Outreach release-train integration manifest

Status: additive domain implementation for CCX-401 through CCX-411. Integration owns every reserved-file change listed here. The Outreach train must not be merged directly to `main`.

## CCX-401 wiring

Server composition in `scripts/preview-server.mjs`:

- Import `buildAuthorizedOutreachHome` from `scripts/outreach-home-service.mjs`.
- Register compact `GET /api/ui/outreach` after the existing compact page reads and before broad legacy handlers.
- Require authenticated `read_internal` through the normal endpoint authorization path.
- When the global vNext flag is off, return 404 before reading state.
- Read state exactly once, pass the public actor and server timestamp to the projection, and accept only `view`, `limit`, and `cursor` query fields.
- Convert `OutreachHomeValidationError` to a calm 400 response; return a calm 500 response without source details for other failures.
- Do not add writes, analytics refreshes, provider calls, sends, approvals, retries, or broad state output.

Shell composition in `scripts/ui/app-shell.mjs`:

- Import `OUTREACH_HOME_STYLESHEET_PATH` and `outreachHomeBrowserSource` from `scripts/ui/pages/outreach-home.mjs`.
- Add `/assets/ui/outreach-home.css` beside the other page-specific stylesheets.
- Append `outreachHomeBrowserSource()` beside other focused page controllers.
- Treat canonical page route `outreach` as a compact controller-owned page and suppress the post-boot `/api/state` background read for it.

Route composition in the reserved parser/navigation files:

- Make `#outreach` the vNext Outreach home route.
- Preserve and canonicalize `#campaigns`, `#campaign`, `#campaign-control`, and `#campaigns-control` to `#outreach` through the vetted parser.
- Preserve exact Campaign links `#outreach/campaign/<encoded-id>` and their existing object fallback until CCX-408 is integrated.
- Keep flag-off legacy routing unchanged.

Authorization and registration:

- Explicitly map `GET /api/ui/outreach` to `read_internal` in `scripts/roles.mjs`.
- Register `test:vnext-outreach-home` as `node scripts/test-vnext-outreach-home.mjs` in `package.json` and add its files to the syntax gate.
- Include `tests/browser/outreach-home.spec.mjs` in browser discovery after the endpoint, route, page, and fixture wiring is complete.
- Add deterministic synthetic Campaign records covering Active, Scheduled, Draft/unavailable, Paused, and hidden authorization to the shared browser fixture; do not replace existing fixture collections.

## Feature flag and rollback

All Outreach pages and endpoints use the existing global `COMMAND_CENTER_UX_VNEXT` flag. Rollback is to disable that flag and remove only the manifest-listed registrations; authoritative Campaign and engine collections are untouched.

## Initial budgets

- Default page size: 24; maximum: 40.
- Compact home response target: under 150 KB and under 250 ms at repository-standard fixture size.
- Browser: one active compact request, no `/api/state` dependency after boot, no mutation or provider request during normal rendering.

Later packet sections extend this manifest without changing the CCX-401 boundary.
