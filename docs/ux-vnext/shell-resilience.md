# Command Center vNext shell resilience

## Scope and architecture

CCX-105 completes the Phase 1 shell by adding vNext-only loading, error,
unauthorized, session-expired, and Recovery Mode states. It does not redesign Today,
Social, Outreach, Partners, Files, Inbox, or any other destination workspace.

The pure contracts live in:

- `scripts/ui/shell-states.mjs`
- `scripts/ui/error-classification.mjs`
- `scripts/ui/permission-labels.mjs`
- `scripts/ui/shell-resilience.mjs`

They reuse the CCX-004 page-header, button, feedback, escaping, focus, and design-token
contracts. They import no storage, database, provider, sending, publishing, or
business engine. `scripts/shell-resilience-service.mjs` is the narrow server-side
route/record authorization projection.

The compositor replaces only the vNext branch's initial technical loading panel and
injects the resilience controller after the unchanged legacy application script. The
flag-off `htmlShell()` bytes are untouched.

## State contract

The immutable plain-data state kinds are:

1. `loading`
2. `error`
3. `unauthorized`
4. `session_expired`
5. `recovery`

Scopes are `boot`, `route`, and `module`. Visible contracts contain only safe titles,
explanations, unchanged-data messages, founder-facing permission labels, retry
metadata, safe navigation, and an optional sanitized support reference. They never
contain an `Error`, stack trace, raw response, endpoint, SQL, environment value,
storage path, capability token, role token, secret, or provider detail.

## Loading and initial boot

The server-composed vNext response includes the approved sidebar/top bar first and an
accessible `aria-busy` skeleton inside `main#app`. Its restrained live text is
“Loading Today.” The visual shapes represent only a page heading and content rows;
they contain no fake metrics, records, statuses, or percentages.

The skeleton adds no data request and has no minimum delay. It is replaced as soon as
the existing boot state and route authorization are ready. Reduced-motion rules
disable material animation. A real asynchronous route read, currently the Decisions
queue, uses the same module-scoped loading contract without inventing a delayed
production dependency.

## Route and module boundaries

Every new vNext route transition calls:

```text
GET /api/ui/route-access?target=<safe-hash>
```

The request authenticates and authorizes through the existing request layer, reads
current state, applies the merged route and exact-record visibility contracts, and
returns only:

```text
ok, allowed, outcome, permissionLabel
```

No record title, ID, count, full state, permission identifier, or mutation action is
returned. Unknown safe routes continue to use the CCX-102 recovery state.

The existing renderer remains the only router and page renderer. A guarded
`safeRenderModule` boundary catches one module exception and substitutes only that
main-region module with founder-facing error copy. Sidebar, mobile top bar, Search,
Create, Help, Profile, navigation, and safe Le-E access remain available. A failed
page is not silently redirected to Today.

## Error classification and retry

The pure classifier distinguishes:

- 401 or invalid session: session expired;
- 403: authenticated permission refusal;
- 404 exact record: the existing generic unavailable behavior;
- timeout or aborted read;
- 429 temporary limit;
- 5xx temporary failure;
- invalid/incomplete safe response; and
- client render exception.

Normal UI does not show status codes or technical exception names.

Retry applies only to the failed read or render boundary. It immediately shows
Working, disables the control, reauthorizes, preserves the exact hash, and permits
only one pending retry. It never retries or resubmits a mutation, form, email,
publication, approval, enrollment, or record creation. A successful module retry
restores the current page and focuses its heading. A repeated failure returns to the
same understandable state without a loop.

The full-state recovery action reuses `loadFullStateInBackground`; it does not replace
the proven Safe Boot request contract.

## Unauthorized and exact-record privacy

Approved visible permission labels include:

| Internal contract | Founder-facing label |
| --- | --- |
| private asset visibility | View private files |
| growth management | Manage campaigns and Partner records |
| content/approval review | Review social posts |
| team-role management | Manage team roles |
| self-check execution | Run application self-checks |
| diagnostics | Manage integrations |

Unknown contracts use “additional access.” Raw capability and role identifiers never
render.

Page-level permission refusal explains the approved founder-facing access needed and
offers Go back and Go to Today. An exact-record refusal is intentionally different:
missing and unauthorized records both show **Record not available** and disclose no
title, ID, count, permission, or existence. Global Search and Global Create keep
their own server-side reauthorization and cannot bypass this boundary.

## Session expiration

Session expiration is separate from a valid account lacking one permission. The shell
closes Search, Create, Profile, Le-E, and the mobile drawer; removes inert and
scroll-lock residue; clears sensitive form/input values; replaces authenticated main
content; and disables state-dependent Search/Create controls. The visible action is
**Sign in again**. Only the current vetted hash remains, and no redirect loop or raw
authentication detail is produced.

## Safe Boot and Recovery Mode

The existing Safe Boot path remains authoritative. In vNext, a full-state boot
failure renders **Recovery Mode** inside the approved shell instead of the legacy
diagnostic card or a blank document. It keeps truthful **Publishing is off** copy,
offers **Try full app again** and **Sign out**, disables Search/Create while required
authenticated state is unavailable, and exposes no App Status diagnostics.

The public `/api/health` DTO remains the fixed minimal `{ "status": "ok" }` response.
Recovery retry is duplicate-safe and creates no full-state request loop.

## Global handlers and action failures

The legacy `error` and `unhandledrejection` handlers remain as last-resort
protection. The vNext controller replaces only their visible fallback with a
classified shell state, prevents raw error insertion, and preserves the document and
shell. It does not broadly suppress console errors.

Global Search and Global Create retain their scoped loading/error contracts. A Search
read failure does not replace the page. A Create validation, authorization, or write
failure creates zero records and is never retried automatically by CCX-105.

CCX-201 applies the same boundary to Inbox. The shell remains visible during the
compact read; a failure replaces only Inbox content and retries only
`GET /api/ui/inbox` while preserving safe group/filter state. Unauthorized reads
render no protected page data or counts. Session expiration clears Inbox items and
the shell badge, while Recovery Mode clears a stale badge and keeps “Publishing is
off.” Retry never invokes a projected action intent.

CCX-202 applies the boundary independently to an explicit Inbox action. Working
feedback never removes the item or changes the badge optimistically. A temporary
failure keeps the item and offers one safe Retry; stale state refreshes only the
compact Inbox; authorization refusal discloses no item; and session expiration
closes confirmation/snooze UI, clears its values, page data, and badge. No failure
path retries automatically or claims a source mutation.

## Accessibility and responsive behavior

Loading uses `aria-busy` and one restrained live announcement. Error and status
regions use appropriate live semantics. Founder-facing headings, visible focus,
keyboard actions, 44-pixel mobile controls, focus restoration, and reduced-motion
behavior remain shared across desktop and mobile.

Browser coverage enforces zero serious and zero critical axe findings, zero
unexpected page/console errors, one active shell layer, and no page-level horizontal
overflow at 1440, 1024, 768, or 390 pixels.

## Test-only failure injection

Deterministic failures exist only in Playwright:

- request interception delays boot or the Decisions read;
- malformed successful fixture responses exercise invalid-response recovery without
  creating browser resource-console errors;
- a page-local renderer replacement throws a caught synthetic module exception; and
- a compact intercepted session outcome exercises expiration cleanup.

No query parameter, public debug route, production environment switch, provider call,
or persistent test record was added. Every fixture uses temporary local state and all
live gates remain off.

## Performance and security

The resilience layer adds no field to `/api/state` and does not change its payload.
The initial skeleton is static HTML/CSS. Route access responses are compact and
read-only. Search and Create issue no request while closed. Retry counts, duplicate
counts, route-access counts, full-state counts, and loading-to-content timing are
reported by the isolated browser fixture.

No state is persisted because loading or rendering failed. No provider is invoked.
No sending, publishing, approval, suppression, enrollment, live gate, authorization
policy, data model, or storage behavior changes.

## Rollback and Phase 1 handoff

Unset `COMMAND_CENTER_UX_VNEXT` or set it to `false`, then restart. The complete
legacy Unlock, Safe Boot, Recovery Mode, routes, aliases, actions, and error handling
return byte for byte. No migration or cleanup is required.

CCX-105 satisfies the Phase 1 implementation exit criteria after review and merge:
the shared shell, responsive navigation, canonical links, Global Create, Global
Search, and resilient states are covered together. CCX-200 may begin only after this
packet is reviewed and merged; CCX-105 does not begin the universal Inbox or redesign
any destination.
