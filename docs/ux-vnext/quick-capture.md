# Unified Quick Capture

## Objective and scope

CCX-205 provides one lightweight, reviewed capture workflow for vNext Today and the
Global Create **Quick note** path. It has exactly seven founder-facing intents:
Task, Decision, Blocker, Post idea, Partner note, Campaign idea, and File/report note.
The workflow makes the selected destination visible before Save and names the saved
destination afterward. It does not begin CCX-206 or redesign the rest of Global
Create.

The workflow is available only when `COMMAND_CENTER_UX_VNEXT` is exactly `true`.
Flag-off HTML, the legacy shell, legacy Today, legacy Quick Capture, routes, aliases,
and existing legacy endpoints remain unchanged. No collection or migration is added.

## Architecture

- `scripts/quick-capture-service.mjs` defines the immutable public intent registry,
  validates compact input, invokes existing authoritative record constructors, and
  returns a compact exact-link result.
- `scripts/ui/quick-capture.mjs` renders and controls the shared form inside the
  existing Global Create sheet. It owns no authorization, storage, routing policy,
  provider, publication, sending, or domain-transition logic.
- `scripts/ui/global-create.mjs` continues to own the reviewed modal, focus trap,
  dirty-close protection, working/error/session states, and focus return. The Today
  entry dispatches the same workflow; it does not render a second form.
- `scripts/preview-server.mjs` authenticates, reauthorizes, bounds request size,
  serializes mutation, and performs scoped persistence through existing helpers.

## Intent and destination contract

| Intent | Visible destination | Existing operation and collection | Exact success link |
| --- | --- | --- | --- |
| Task | Tasks | Task normalizer → `tasks` | `#item/tasks/task-quick-<request-id>` |
| Decision | Capture Inbox | Capture Inbox creator → `captureInbox` | `#item/captureInbox/capture-<request-id>` |
| Blocker | Capture Inbox | Capture Inbox creator → `captureInbox` | `#item/captureInbox/capture-<request-id>` |
| Post idea | Social | Global Create object creator → `posts` | `#social/post/post-<request-id>` |
| Partner note | Capture Inbox | Capture Inbox creator → `captureInbox` | `#item/captureInbox/capture-<request-id>` |
| Campaign idea | Outreach | Global Create object creator → `campaigns` | `#outreach/campaign/campaign-<request-id>` |
| File/report note | Files | Global Create object creator → `dataRoomItems` | `#files/data-room-item/document-<request-id>` |

Decision, Blocker, and Partner note remain reviewable Capture Inbox records and are
not converted into Tasks. Partner note does not update a Partner. Post, Campaign, and
File/report intents create inert new records and never update an existing source.
Campaign type and Files section are explicit conditional fields; no value is silently
inferred.

## Compact endpoints and authorization

`GET /api/ui/quick-capture/capabilities` returns only whether capture is available and
the safe public intent presentation needed by the sheet. It exposes no role or
capability ID. `POST /api/ui/quick-capture` accepts one bounded capture body and
returns only the safe result presentation. Both routes authenticate and reauthorize
on every request; flag-off requests return 404 and missing or unknown authority fails
closed.

After body validation, the POST route reauthorizes the exact existing destination
policy: Task creation, Capture Inbox routing, Social idea creation, Campaign draft
creation, or File document-record creation. The browser cannot grant authorization
by selecting or hiding a control. Authorization and validation failures create no
record, audit entry, or activity entry.

The compact result contains intent and destination labels, title, exact canonical
hash, idempotency outcome, and founder-facing success copy. It returns no full state,
full source record, capability ID, provider body, secret, token, private path, raw
email body, audit payload, or executable action intent.

## Selection, Le-E suggestion, and save behavior

No intent is preselected. Choosing an intent updates the labelled **Selected
destination** confirmation before Save becomes useful. Le-E may supply one of the
seven public intent IDs as a suggestion, but the radio remains unselected until the
user explicitly chooses the intent or activates **Use … suggestion**. Suggestions
never submit, save, route, or mutate work.

Save is the single primary action. The form shows validation, working, success,
authorization, session-ended, and safe failure states. A successful result says where
the capture went and provides one **Open** link using the server-returned reviewed
hash. The exact new object is immediately routable, and ordinary browser Back/Forward
behavior remains intact. Source-derived copy is assigned with safe DOM text methods;
the browser accepts only a shared route-policy hash and never rebuilds an exact link.

The compact save result is retained only in page memory long enough to render the
exact newly created route immediately. Quick Capture does not refetch boot or full
application state after Save. A later normal page load reads the authoritative record
through the unchanged boot contract; the in-memory result is not persistence or a
second source of domain truth.

## Idempotency, audit, and persistence

Each fresh form receives one UUID `creationRequestId`. Submission locks synchronously
before the request, preventing duplicate activation. The stable record ID derives
from the request ID; a repeated valid request returns the same exact link with
`alreadyExisted: true`. It does not overwrite the record or append duplicate audit or
activity evidence. A request ID is bound to its first intent across every destination;
reusing it for a different intent fails with no write.

Successful captures preserve existing activity and audit conventions and write only
the authoritative destination collection plus `activityEvents` and `auditHistory`.
There is no broad full-state request or write from the page and no Quick Capture
collection. Request text is trimmed, length- and enum-bounded, control/script text is
rejected, and rendered text is escaped.

## Safety boundary

Quick Capture creates internal inert records only. Merely opening the sheet performs
no write. It never sends, publishes, launches, releases, enrolls, approves, completes,
snoozes, invokes a provider, changes a Partner stage, changes a File status, changes
suppression, changes a live gate, or starts another state machine. Live-action gates
remain off in deterministic fixtures.

## Accessibility, responsive behavior, and resilience

The existing Create sheet supplies a labelled modal, focus containment, Escape,
Cancel, focus return, keyboard operation, and dirty-close confirmation. Every field
has a visible label; intent and destination are communicated in text, not color. Save
and Open are text controls with practical 44-pixel mobile targets. At 390 pixels the
same form fits without page-level horizontal overflow or an icon-only critical
action. Serious and critical axe violations are held at zero.

Opening from Today returns focus to the subordinate Today control. Opening from
Global Create returns focus to Create. Session expiration clears the form and
authenticated overlays through the CCX-105 contract. Validation and ordinary failure
preserve safe entered values and never retry automatically.

## Verification, screenshots, rollback, and handoff

`npm run test:vnext-quick-capture` covers all seven intents, destination and exact-link
matrices, authorization, validation, idempotency, mutation counts, legacy hashes,
routes, aliases, and prohibited effects. Playwright covers the shared entry points,
real record creation and opening, desktop/mobile layout, keyboard behavior, session
expiration, accessibility, and external-action request counts using isolated
synthetic fixture state.

Unedited evidence is in `docs/ux-vnext/screenshots/ccx-205/` for desktop and 390-pixel
mobile intent, destination, Task success, Post idea success, Partner note success,
validation, and exact Open states.

Rollback removes the vNext service, shared UI module and stylesheet, endpoint wiring,
Today event entry, tests, screenshots, and this document. Existing collections need
no migration rollback. The legacy Global Create note endpoint and legacy renderers
remain available for rollback compatibility.

CCX-206 remains out of scope. It is unblocked only after this packet's draft PR,
screenshots, and real workflow are reviewed and CCX-205 is merged.
