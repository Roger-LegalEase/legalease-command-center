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

## CCX-701 — Setup checklist

- Import `buildSetupChecklist` from `scripts/discovery-checklist-service.mjs` and add compact authenticated `GET /api/ui/discovery/checklist` with `read_internal`.
- Build its `sources` argument server-side from one current authorized state read and the existing projections: Social creative catalog, integrated Social connection contract, Partners home, Social home/Post projection, Outreach home/Campaign projection, and Investor Room requirements. The browser must never submit completion booleans.
- Normalize only the bounded counts/references required by `buildSetupChecklist`; do not return full state, asset metadata, account secrets, recipient content, Partner communications, File content, or raw requirement records.
- A brand asset counts only when its reviewed projection says it is approved and selectable with an exact source reference. A Social connection counts only for the integrated server-verified `connected_publishing_off` or `ready_to_publish` state; an account row, token row, provider label, or browser assertion alone does not count.
- Partner, Post, and Campaign completion uses the respective authorized projection count. Unavailable and unauthorized remain distinct. Hidden records cannot affect completion or counts.
- Investor Room completion requires at least one explicit requirement projected as current. Merely storing, uploading, or sharing an unrelated File does not count.
- Register `renderDiscoveryChecklist`, `discoveryChecklistBrowserSource`, and `/assets/ui/discovery-checklist.css` in the authenticated profile/getting-started surface. Every action uses the vetted parser or existing Global Create; Investor Room upload opens `#files?collection=investor-room`, waits for the integrated Files controller, opens the existing upload dialog, and selects the Investor Room collection without submitting it.
- Social connections route requirement: `#settings?view=social-connections`. If Social Integration selects a different vetted query key, update this one static manifest/action value during final rebase and its focused assertion; never infer it from browser content.
- Package registration: `test:vnext-discovery-checklist` → `node scripts/test-vnext-discovery-checklist.mjs`.

## CCX-702 — Guided empty states

- Import `buildGuidedEmptyState` and `renderGuidedEmptyState`; register `discoveryEmptyStateBrowserSource` and `/assets/ui/discovery-empty-states.css`.
- Replace only the generic primary-workflow empty/filtered-empty markup in Today, Inbox, Social, Outreach, Partners, Files, Investor Room, and Global Search with the matching contract. Preserve each page's existing loading, unavailable, unauthorized, session-expired, and error handling; pass `state:"unavailable"` or `state:"unauthorized"` instead of presenting a normal empty state when source truth is missing or forbidden.
- Integration insertion points are the existing page functions that currently emit `No … yet`, `No … in this view`, `You’re all caught up`, or filter-only empty containers. Do not change their projection counts, filtering, authorization, compact endpoints, pagination, or actions.
- Primary actions reuse existing Global Create, Global Search, route compatibility, and Files upload. `retry` and `clear-filters` dispatch `vnext:guided-retry` and `vnext:guided-clear-filters` for the owning page controller to handle with its current request/filter logic.
- No example text is a record. It is reviewed instructional copy only, contains no identity, count, status, or completion claim, and is omitted for unavailable/unauthorized states.
- Package registration: `test:vnext-discovery-empty-states` → `node scripts/test-vnext-discovery-empty-states.mjs`.

## Shared feature and rollback contract

- Gate every Discovery registration server-side behind `COMMAND_CENTER_UX_VNEXT_DISCOVERY`, default false until Phase 7 acceptance passes. Browser state, hashes, query strings, cookies, and storage cannot enable it.
- Rollback sets that flag false and removes only manifest-defined imports, routes, styles, controllers, menu items, and package/browser registrations. Preserve user discovery preferences, activity, audit, and all domain records.
