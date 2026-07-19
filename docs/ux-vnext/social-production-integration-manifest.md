# Social production train integration manifest

Status: additive Lane A contract. Reserved runtime, role, shell, navigation, package, feature-flag, and shared-fixture files are intentionally unchanged.

## Shared registrations

- Gate every registration below server-side with `COMMAND_CENTER_UX_VNEXT_SOCIAL === "true"`; absent, false, browser storage, cookies, query strings, and hashes must never enable it.
- Pass `{ productionEnabled:true }` as the fifth argument to `buildPostComposerContract` only inside that server-side gate. The default is false and omits every new production action control from the existing composer.
- Import Social production action modules into `scripts/preview-server.mjs` only on the Integration branch. Resolve the exact authorized Post before every action and pass a fresh compact state snapshot.
- Register Social action roles in `scripts/roles.mjs`: creative, variant, schedule, and feedback writes require `manage_content_drafts`; approval requires `manage_approval_queue`; publish requires `social_publish`; every action also requires an authenticated current session.
- Keep `scripts/ui/pages/post-composer.mjs` as the sole `#social/post/<encoded-id>` composer renderer and register its existing controller through `scripts/ui/app-shell.mjs`.
- Keep `assets/ui/post-composer.css` page-scoped and register it through the existing composer stylesheet composition.

## CCX-303B endpoints and adapters

- `POST /api/ui/social/post/:postId/creative` → `saveSocialCreativeSelection`. Provide `commitPostMutation`, implemented as one atomic scoped Post mutation with expected-version and request-id idempotency plus the supplied activity and append-only audit evidence. Do not accept browser catalog, approval, or eligibility truth.
- `POST /api/ui/social/post/:postId/render` → `renderSocialCreative`. Provide the existing reviewed render/image-generation operation as `renderPost`; it must use the supplied exact source references and idempotency key, retain the previous current image on failure, and return only `{ ok, imageId, reused }`.
- Response contracts must be rebuilt with `buildPostComposerContract`; do not return full company state, asset bytes, private paths, signed URLs, provider payloads, or credentials.

## Registration backlog

- Package script: `test:vnext-social-creative-actions` → `node scripts/test-vnext-social-creative-actions.mjs`.
- `POST /api/ui/social/post/:postId/variants` → `saveSocialVariants` from `scripts/social-variant-actions.mjs`. Supply the same atomic `commitPostMutation` adapter; preserve stored deselected variants, stable IDs, creative references, explicit blanks, and fallback absence exactly.
- Package script: `test:vnext-social-variant-actions` → `node scripts/test-vnext-social-variant-actions.mjs`.
- `GET /api/ui/social/calendar` → `buildSocialCalendarContract`; return only the compact contract. Register `renderSocialCalendarPage` and `assets/ui/social-calendar.css` for the canonical calendar route while preserving existing aliases through the vetted parser.
- `POST /api/ui/social/post/:postId/schedule` → `saveSocialSchedule`; provide atomic `commitPostMutation`. The adapter must persist only `scheduledFor`, `timezone`, and `scheduleStatus`, expected-version/request-id truth, plus supplied activity/audit evidence. It must not approve, publish, retry, or call a provider.
- Package script: `test:vnext-social-schedule-actions` → `node scripts/test-vnext-social-schedule-actions.mjs`.
- `POST /api/ui/social/post/:postId/approve` → `approveSocialPost`; provide the existing reviewed approval operation as `applyApproval`. It must independently authorize, use the supplied freshly rebuilt plan, record approval/audit evidence, and never schedule or publish.
- `POST /api/ui/social/post/:postId/request-changes` → `requestSocialPostChanges`; provide `recordRequestedChanges`, preserving the stable feedback ID, exact Post relationship, historical feedback, idempotency, and bounded summary only.
- `POST /api/ui/social/post/:postId/regenerate` → `regenerateSocialPostImage`; provide the same reviewed render adapter as CCX-303B. A failed regeneration retains the previous current image and no regeneration approves an image.
- Package script: `test:vnext-social-review-actions` → `node scripts/test-vnext-social-review-actions.mjs`.
- `GET /api/ui/social/connections` → `buildSocialConnectionsContract`; register `renderSocialConnectionsPage` at the vetted Settings → Social connections route and `assets/ui/social-connections.css`. Return no tokens, credentials, private account detail, or raw payload. Existing reviewed provider connection operations remain authoritative; this train adds no gate toggle.
- `POST /api/ui/social/post/:postId/publish` → `publishSocialPost`. Supply `loadState`, the existing durable `acquireSocialPublishClaim`/`transitionSocialPublishClaim` store adapters, existing controlled `publishChannel`, and a scoped `recordPublicationResult`. The channel adapter receives identifiers and an idempotency key only; it resolves credentials server-side. Reauthorize and rebuild all projections before each attempt.
- `POST /api/ui/social/post/:postId/manual-package` → `createSocialManualPackage`; provide the existing safe manual-package operation. Package creation must never write Published truth.
- Package script: `test:vnext-social-publishing-actions` → `node scripts/test-vnext-social-publishing-actions.mjs`.
- Browser spec registration: `tests/browser/social-production.spec.mjs`. On the final release branch also retain PR #104 registrations for `scripts/test-vnext-social-acceptance.mjs` and `tests/browser/social-acceptance.spec.mjs`; the accounting suite and this production workflow are complementary and must both run.

## Exact shared-file insertion contract

1. `scripts/preview-server.mjs`: import the five action modules plus `buildSocialCalendarContract` and `buildSocialConnectionsContract` beside the current Post composer imports. Add the compact GET and scoped POST routes to the authenticated vNext Social route block, before generic item routing. Re-read authoritative state inside each handler and serialize only the returned compact action result or a rebuilt composer contract.
2. `scripts/roles.mjs`: add exact patterns for the endpoints above using the capabilities listed under Shared registrations. Do not map any browser endpoint to environment-gate mutation.
3. `scripts/ui/app-shell.mjs`: import `renderSocialCalendarPage`, `socialCalendarBrowserSource`, and `renderSocialConnectionsPage`; register the calendar and Settings surfaces alongside existing Social-specific page controllers. The calendar `vnext:social-move-date` event must open the exact encoded Post composer and its Schedule disclosure; it must not write by itself.
4. `scripts/ui/navigation.mjs` and `scripts/ui/route-compatibility.mjs`: preserve every existing Social/calendar/queue bookmark through the vetted parser. Canonical Post links remain `#social/post/<encoded-id>`. Add the Settings → Social connections destination without raw string interpolation.
5. Stylesheet composition: add `assets/ui/social-calendar.css` and `assets/ui/social-connections.css`; `assets/ui/post-composer.css` remains the existing page-specific composer stylesheet. Do not copy these rules into global CSS or tokens.
6. `package.json`: register the five focused Node tests listed above. Include `tests/browser/social-production.spec.mjs` in the Social production browser job without changing shared startup semantics.
7. Shared browser fixture: extend only the existing synthetic composer fixture with reviewed canonical template/asset references, two selected channels, safe connection states, an inert manual-package adapter, and a controlled injected publication adapter. The adapter must never resolve or contact a provider and must count one call per durable claim.

## Routes and feature flag

- Canonical composer: `#social/post/<encoded-id>`.
- Canonical calendar: retain the current vNext calendar route selected by Integration; month, week, all-channel, and unscheduled are view state only and never authority.
- Connections: vetted Settings → Social connections route; provider-specific review destinations must use the existing route parser.
- Server-side gate: `COMMAND_CENTER_UX_VNEXT_SOCIAL`, default false. Gate the new routes, page/controller registrations, and feature capabilities. The browser must receive no mechanism to set or override it.
- Flag-off behavior must preserve the current CCX-300–CCX-310 read-only Social behavior and route compatibility, with no new endpoint exposure.

## Test registration

- `node scripts/test-vnext-social-creative-actions.mjs`
- `node scripts/test-vnext-social-variant-actions.mjs`
- `node scripts/test-vnext-social-schedule-actions.mjs`
- `node scripts/test-vnext-social-review-actions.mjs`
- `node scripts/test-vnext-social-publishing-actions.mjs`
- `tests/browser/social-production.spec.mjs`
- From frozen PR #104 after Integration: `node scripts/test-vnext-social-acceptance.mjs` and `tests/browser/social-acceptance.spec.mjs`.

The Integration branch must keep all existing A-packet foundation tests registered. No real provider request, developer credential, production data, or live gate may enter any fixture.

## Payload and performance budgets

- Composer, calendar, and connections compact JSON: less than 64 KiB for the standard deterministic fixture and less than 250 ms projection time at the current 100-Post benchmark scale.
- Mutation request bodies: less than 32 KiB; feedback summary at most 280 characters; request IDs and stable IDs at most 160 characters.
- Action responses: less than 16 KiB and contain no full state, asset bytes, credentials, local paths, signed URLs, or raw provider payloads.
- Publish endpoint time excludes the existing controlled provider adapter latency, reports per-channel outcomes, and must not hold a browser request open to retry a successful or ambiguous claim.

## Cross-lane dependencies

- Integration owns every reserved file and the final atomic `commitPostMutation`, review, render, manual-package, connection, and publication adapter composition.
- PR #104 is frozen; Integration must bring its CCX-310 accounting registrations forward without changing that branch.
- No dependency exists on Outreach, Partners, Files, Phase 7, or Phase 8 implementation.

## Rollback

Set `COMMAND_CENTER_UX_VNEXT_SOCIAL=false` and remove only the shared imports, routes, stylesheet/controller registrations, role mappings, package scripts, and synthetic fixture registrations described here. Do not delete or rewrite Posts, selected source references, variants, schedules, approvals, feedback, image versions, manual packages, publish claims, results, activity, or audit evidence. Legacy and read-only Social routes remain intact.
