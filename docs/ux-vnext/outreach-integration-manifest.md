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
- For an existing canonical Campaign wizard draft, pass requested canonical Partner IDs through Partner PR #100's `buildPartnerCampaignSelection` contract before saving source references. Use its server-revalidated IDs and exact record source references to form the existing draft's `{ sourceKind:"partner", sourceId }` selection; do not call `createPartnerCampaignDraft` and do not create a second Campaign.
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

## CCX-408 wiring

- Import `buildCampaignDetailView` and register compact `GET /api/ui/outreach/campaign/:encoded-identity` with `read_internal`, a bounded `tab`, one state read, and calm unauthorized/not-found responses.
- Register `renderCampaignDetail`, its focused controller, and `/assets/ui/campaign-detail.css` in the reserved shell composition.
- The vetted parser must keep canonical `#outreach/campaign/<encoded-source-id>` behavior and additionally accept encoded CCX-400 stable identities for adapted `outreach:` and `reactivation:` detail links without treating them as canonical collection IDs.
- Compose tab payloads from the detail service; do not expose raw source records or full state.
- Register a bounded pause/resume action endpoint that accepts only action and idempotency key, rebuilds policy server-side, and connects `executeCampaignStatusAction` to the existing durable claim, approval, pause, and resume operations. Never infer capability from the browser.
- Register `test:vnext-campaign-detail` as `node scripts/test-vnext-campaign-detail.mjs`.

## CCX-409 wiring and Lane B dependency

- Compose `buildCampaignRepliesOutcomes` and `renderCampaignRepliesOutcomes` into the Replies tab. Preserve `read_sensitive` behavior and never include raw reply bodies in unrelated records.
- Register a bounded reply/outcome action endpoint accepting only reply ID, supported action fields, and request ID. Re-resolve the reply and Campaign server-side, enforce capability, scope writes, append audit, and return zero external actions.
- Adapter map: `partner_log_activity` → Partner `logPartnerActivity`; `partner_set_next_action` → Partner `setPartnerNextAction`; `partner_stage_suggestion` → Partner `applyPartnerStageSuggestion`; `scoped_reply_classification` → a versioned single-reply update. Use thin composition wrappers for the authoritative state, actor, server timestamp, and request ID; do not copy or rewrite Partner adapters.
- For stage application, pass `plan.fields.partnerId`, `plan.fields.suggestionId`, `plan.fields.confirmed`, and `plan.requestId` to `applyPartnerStageSuggestion`. Do not pass or trust a browser-supplied destination stage or evidence. That Partner operation must freshly resolve the reviewed classification, visible evidence, Partner authorization, suggestion availability, current Partner state, scoped write, activity/audit evidence, and idempotency.
- Exact dependency: Partner PR #100 head `0300f052fad33451a62c952e4ea3c5fd61fb651d`, `scripts/partner-outreach-integration.mjs`, `scripts/partner-record-actions.mjs`, and `docs/ux-vnext/partners-train-integration-manifest.md`. A reply never silently changes Partner stage.
- Register `test:vnext-campaign-replies-outcomes` as `node scripts/test-vnext-campaign-replies-outcomes.mjs`.

## CCX-410 wiring

- Compose `buildCampaignAdvancedDelivery` and `renderCampaignAdvancedDelivery` into an Advanced section that is closed by default.
- Require `read_internal` for the Campaign and `read_sensitive` for detail; include raw event references only with `view_diagnostics`. Reapply record visibility to every supporting record.
- Never serialize provider payloads, recipients, addresses, credentials, tokens, secrets, or editable safety controls. Missing telemetry stays null/unavailable.
- Do not add an Advanced mutation endpoint. Existing safety limits and sending authority remain server-owned.
- Register `test:vnext-campaign-advanced-delivery` as `node scripts/test-vnext-campaign-advanced-delivery.mjs`.

## CCX-411 acceptance and final registrations

- Register `test:vnext-outreach-acceptance` as `SKIP_ENV_LOCAL_FILE=1 node scripts/test-vnext-outreach-acceptance.mjs` and include it in the syntax gate.
- Include `tests/browser/outreach-train-acceptance.spec.mjs` in browser discovery after every manifest item below is composed. The spec uses only synthetic state and controlled injected adapters.
- Register `campaignReviewBrowserSource()` with the Review page. Its dialog emits only the `campaign:review-action` intent; the shell controller must then call the bounded Review endpoint with the current server-projected fingerprint and an idempotency key. Never put recipient references, approval state, or execution authority into that event.
- Register `renderCampaignWizardState()` for loading, unavailable, error, unauthorized, and session-expired Campaign draft responses. Preserve the current saved draft on any failed write.
- Use the existing page-specific stylesheets `/assets/ui/campaign-wizard.css` and `/assets/ui/campaign-detail.css`; no global CSS or token changes are required.

## Consolidated server imports and compact reads

Integration must import the Outreach home, wizard, Goal, Audience, Message, Schedule, Review, detail, Replies/outcomes, and Advanced modules named in CCX-401 through CCX-410 above. Required reads are:

- `GET /api/ui/outreach`
- `GET /api/ui/outreach/campaign/:encoded-stable-identity/draft`
- `GET /api/ui/outreach/campaign/:encoded-stable-identity/draft?step=<goal|audience|message|schedule|review>`
- `GET /api/ui/outreach/campaign/:encoded-stable-identity?tab=<overview|messages|audience|replies|results|activity>`

All reads require an authenticated `read_internal` decision, one bounded state read, visibility-filtered projections, and flag-off 404 before state access. No read returns a full Campaign source record, recipient address, provider payload, credential, or company state.

## Consolidated scoped writes and actions

- Campaign draft save: versioned single-record `campaigns` fields plus audit append.
- Test send: one explicit authorized test-recipient reference, existing safe test-send adapter, durable idempotency, all current content and environment gates.
- Review action: current server audience fingerprint plus durable idempotency; existing approval or execution operation according to current policy.
- Pause/resume: current server policy plus durable idempotency; existing engine and approval operation.
- Reply/outcome: one authorized reply reference, bounded action fields, appropriate Lane B/scoped-reply adapter, and audit append.

Every mutation requires session and CSRF enforcement, exact endpoint authorization, body limits, server-side identity resolution, current-state safety revalidation, and normal audit behavior. There is no generic patch endpoint, browser-provided collection, suppression override, provider call path, or approval-and-execute shortcut.

## Consolidated routes, aliases, pages, and controllers

- Canonical home: `#outreach`.
- Preserve `#campaigns`, `#campaign`, `#campaign-control`, and `#campaigns-control` through the vetted compatibility parser.
- Canonical Campaign source link: `#outreach/campaign/<encoded-source-id>`.
- Adapted CCX-400 Campaign identities remain encoded as one vetted route value and must never be split or interpolated as raw HTML.
- Register Outreach home, Campaign wizard, Goal, Audience, Message, Schedule, Review, Campaign detail, Replies/outcomes, and Advanced page renderers.
- Register only the focused Outreach home, wizard, Review-confirmation, detail, and reply-action controllers. All link navigation stays internal and history-compatible.
- Suppress browser `/api/state` reads for Outreach home, wizard, and detail after boot.
- When the global vNext flag is off, no new endpoint, route, controller, or stylesheet changes legacy behavior.

## Final package and browser registration

Register these direct scripts in `package.json`: `test:vnext-outreach-home`, `test:vnext-campaign-wizard`, `test:vnext-campaign-goal-step`, `test:vnext-campaign-audience-step`, `test:vnext-campaign-message-step`, `test:vnext-campaign-schedule-step`, `test:vnext-campaign-review-step`, `test:vnext-campaign-detail`, `test:vnext-campaign-replies-outcomes`, `test:vnext-campaign-advanced-delivery`, and `test:vnext-outreach-acceptance`. Add all new JavaScript modules to the syntax gate. Browser discovery must include `outreach-home.spec.mjs` and `outreach-train-acceptance.spec.mjs` without changing shared fixture authority.

## Cross-lane dependency

Partner PR #100 is complete at `0300f052fad33451a62c952e4ea3c5fd61fb651d`; its integration contract is `docs/ux-vnext/partners-train-integration-manifest.md`.

- Existing Campaign Audience: call `buildPartnerCampaignSelection` only to validate canonical Partner IDs/source references for the already-created Campaign, then persist those references through the Outreach scoped draft path. Recheck eligibility and suppression from authoritative current state. Never create another Campaign to populate Audience.
- Partner record “Create outreach”: call `createPartnerCampaignDraft` once, then open its exact returned canonical Campaign link in the Outreach wizard. Do not also call Global Create. The result must remain Draft, audience unconfirmed, zero sends/enrollments/approvals/schedules, and `liveMode:false`.
- Reply/outcome actions: use `logPartnerActivity`, `setPartnerNextAction`, and `applyPartnerStageSuggestion` through thin Integration-owned composition. Stage application requires a reviewed classification, visible evidence, current authorization, explicit confirmation, fresh current-state lookup, one scoped Partner write, activity/audit evidence, and idempotency.

## Final performance and payload budgets

- Outreach home: under 150 KB and 250 ms, 24 rows by default and 40 maximum.
- Wizard shell and each step: under 150 KB and 300 ms; save bodies under 32 KB.
- Audience preview: 25 recipients by default and 50 maximum, under 150 KB and 300 ms.
- Campaign detail and each tab: under 150 KB and 300 ms; Advanced event references capped at 100.
- Actions: bounded request under 32 KB and initial safe response under 64 KB; provider/existing-engine time is governed by existing operation timeouts.
- Browser: no `/api/state` after boot, at most one active compact page request plus an explicit user action, and zero background mutation/provider requests.

## Rollback

Disable the existing global vNext flag, remove the additive server/page/controller/stylesheet/test registrations, and leave every authoritative Campaign, recipient, attempt, reply, suppression, approval, event, audit, and claim collection untouched. No migration or data rollback is required. If an action adapter is unavailable, fail that action closed while retaining read-only Campaign access and saved canonical drafts.
