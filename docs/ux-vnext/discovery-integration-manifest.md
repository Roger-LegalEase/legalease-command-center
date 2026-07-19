# Discovery train integration manifest

Status: additive Lane A contract. Integration-owned runtime, shell, route, role, package, fixture, feature-flag, and global-style files are intentionally unchanged.

## CCX-700 — First-run onboarding

- Import `buildFirstRunOnboarding` and `saveFirstRunOnboarding` from `scripts/discovery-onboarding-service.mjs` into the authenticated vNext composition block.
- Add compact authenticated `GET /api/ui/discovery/onboarding` with `read_internal`. Read only the current actor's discovery preference and return the compact contract.
- Add scoped `POST /api/ui/discovery/onboarding` with `mutate_state`, CSRF/session enforcement, bounded JSON, expected-version conflict handling, and request-id idempotency. Provide `commitPreference` as one atomic write to the current actor's preference plus the supplied activity and append-only audit evidence. It must not accept another actor ID from the browser.
- Store only `status`, `choiceId`, `completedAt`, `deferredAt`, and version truth. No connection, product flag, publishing gate, sending gate, approval, schedule, or external action is changed.
- Render `renderDiscoveryOnboarding` from `scripts/ui/pages/discovery-onboarding.mjs` once inside the authenticated shell when `shouldOpen` is true. Register `discoveryOnboardingBrowserSource` and `/assets/ui/discovery-onboarding.css`.
- Add a Profile-menu action labelled **Start product tour again** that dispatches `vnext:open-onboarding`; this reopens the surface but does not erase completion or write until the user selects or defers.
- The controller must retain the vetted parser check before navigating. Global Create choices invoke the existing `social-post` or `outreach-campaign` workflow and never duplicate their forms or endpoints.
- Canonical route choices after feature composition: `#partners`, `#files?collection=investor-room`, and `#today`. Keep route values inside the existing compatibility contract; do not interpolate raw identifiers.
- On `401`, disable the surface and show the session-expired copy. On reload, the server preference is authoritative. Do not read or write cookies, local storage, or session storage for completion.
- Package registration: `test:vnext-discovery-onboarding` → `node scripts/test-vnext-discovery-onboarding.mjs`.

## Shared feature and rollback contract

- Gate every Discovery registration server-side behind `COMMAND_CENTER_UX_VNEXT_DISCOVERY`, default false until Phase 7 acceptance passes. Browser state, hashes, query strings, cookies, and storage cannot enable it.
- Rollback sets that flag false and removes only manifest-defined imports, routes, styles, controllers, menu items, and package/browser registrations. Preserve user discovery preferences, activity, audit, and all domain records.
