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

## CCX-402 wiring

- Import `buildCampaignWizardView` and `persistCampaignWizardDraft` from `scripts/campaign-wizard-service.mjs`.
- Register compact `GET /api/ui/outreach/campaign/:encoded-stable-identity/draft` with authenticated `read_internal`.
- Register scoped `POST /api/ui/outreach/campaign/:encoded-stable-identity/draft` with `manage_growth`, bounded JSON, CSRF/session enforcement, expected-version conflict handling, and a scoped single-record `campaigns` persistence adapter plus existing audit append.
- Never accept a collection, record ID, execution flag, or arbitrary patch path from the browser. Resolve the vetted stable identity server-side.
- Import the Campaign wizard page/controller and `/assets/ui/campaign-wizard.css` in the reserved shell composer. Route wizard entry through the vetted exact Campaign identity and a bounded `step` query.
- Register `test:vnext-campaign-wizard` as `node scripts/test-vnext-campaign-wizard.mjs`.
- Flag off: both endpoints return 404 before state access; the legacy Campaign flow remains unchanged.
- Response target: under 100 KB and 250 ms. Save body target: under 32 KB.

## CCX-403 wiring

- Compose `buildCampaignGoalStep` into the Campaign draft GET response when `step=goal` and render it with `renderCampaignGoalStep`.
- Validate saves with `createCampaignGoalSavePlan`; never trust browser-provided type labels, related-record labels, owner labels, identity, or scope.
- Related Partner programs, products, and owners must be compact and visibility-filtered server-side.
- Register `test:vnext-campaign-goal-step` as `node scripts/test-vnext-campaign-goal-step.mjs`.

## CCX-404 wiring

- Compose `buildCampaignAudienceStep` into `step=audience` reads and render with `renderCampaignAudienceStep`.
- Accept only vetted source references, saved segment ID, supported filters, selection confirmation, limit, and filter-bound cursor. Re-resolve visibility and eligibility from current state on every read and before Review/launch.
- Persist selection references through `createCampaignAudienceSavePlan`; never accept included/excluded counts, eligibility, delivery addresses, or an execution recipient list from the browser.
- Register `test:vnext-campaign-audience-step` as `node scripts/test-vnext-campaign-audience-step.mjs`.
- Compact page target: 25 recipients by default, 50 maximum, under 150 KB and 300 ms per page.

## CCX-405 wiring

- Compose `buildCampaignMessageStep` and `renderCampaignMessageStep` for `step=message`; persist validated fields through `createCampaignMessageSavePlan`.
- Register dedicated bounded test-send and Le-E-assistance action endpoints. Test send must require `manage_growth`, CSRF/session checks, one authorized test-recipient ID, a server idempotency key, and the existing safe sending adapter; it must never accept or derive the full audience.
- Le-E assistance runs only for `requested:true`, never auto-applies, and passes no recipient content, credentials, or provider payload.
- Sender identities are server-filtered verified projections. Existing provider and UPL/content review gates remain authoritative.
- Register `test:vnext-campaign-message-step` as `node scripts/test-vnext-campaign-message-step.mjs`.

## CCX-406 wiring

- Compose `buildCampaignScheduleStep` and `renderCampaignScheduleStep` for `step=schedule`; persist only through `createCampaignScheduleSavePlan`.
- Do not create an execution endpoint in this packet. Schedule persistence is planning only and must not toggle live mode, approval, sending, provider, or heartbeat state.
- Keep existing `withinSendingWindow`, Eastern Time caps, and send-time engine checks authoritative. Reject invalid, ambiguous, and nonexistent times before persistence.
- Register `test:vnext-campaign-schedule-step` as `node scripts/test-vnext-campaign-schedule-step.mjs`.

## CCX-407 wiring

- Compose `buildCampaignReviewStep` and `renderCampaignReviewStep` for `step=review`.
- Register a bounded review-action endpoint accepting only the vetted stable identity, current audience fingerprint, and request idempotency key. Rebuild Review from current state; never accept recipient refs, counts, message, schedule, readiness, approval, or safety flags from the browser.
- Connect `executeCampaignLaunch` only to the existing approval operation, durable send-claim/idempotency store, and authoritative campaign execution engines. Run suppression, hold, send-window, cap, approval, connection, compliance, and environment gates again immediately before execution.
- Approval requests must return `executed:false`. Duplicate claims return the recorded prior outcome without another engine call. Preserve zero/some/all outcome detail in safe response and audit evidence.
- Register `test:vnext-campaign-review-step` as `node scripts/test-vnext-campaign-review-step.mjs`.
