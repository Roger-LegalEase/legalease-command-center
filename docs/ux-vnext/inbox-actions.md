# Inbox action adapter

Status: CCX-202 contract
Read endpoint: `GET /api/ui/inbox`
Action endpoint: `POST /api/ui/inbox/action`
Vocabulary: Open, Approve, Complete, Snooze

## Objective and architecture

CCX-202 lets the universal Inbox invoke only existing reviewed source-domain transitions. Inbox remains a disposable projection, never a source of truth. There is no Inbox collection, action ledger, business state machine, generic record patch, migration, or client-side authority.

The implementation has three narrow layers:

- `scripts/ui-actions/inbox-actions.mjs` is an immutable presentation/source-family registry. It imports no storage, network, provider, or business engine and executes nothing.
- `scripts/inbox-action-service.mjs` rebuilds the current authorized CCX-200 projection, resolves one stable Inbox item ID, reauthorizes and revalidates its current source, and calls `transitionQueueItem` or `updateTaskInState`.
- `scripts/ui/inbox-action-ui.mjs` renders confirmation/snooze behavior, submits one strict request, blocks duplicate activation, shows safe feedback, and refreshes the compact Inbox. It does not determine source validity or permission.

`scripts/preview-server.mjs` contains only endpoint composition: bounded JSON read, one server timestamp, serialized current-state read, service call, scoped collection write, and compact response.

## Server-authoritative resolution

The browser sends only a stable `inboxItemId`, accepted intent, bounded `requestId`, rendered item version, and a snooze date only for Snooze. Every request:

1. authenticates and applies existing origin/CSRF checks;
2. constructs the actor from the server session;
3. reads current state inside the existing serialized mutation boundary;
4. rebuilds `buildInboxView(state, actor, now)` with one server time;
5. finds the visible item by stable Inbox item ID;
6. resolves internal source identity only from that server projection;
7. confirms the source, capability, visibility, and intent remain current;
8. detects stale `expectedUpdatedAt` before transition;
9. invokes the existing authoritative domain function; and
10. rebuilds authorized counts and returns a compact result.

The client cannot name a collection, source record, capability, status, endpoint, operation, or patch. Missing and unauthorized IDs return the same non-disclosing result.

## Endpoint contract

`POST /api/ui/inbox/action` accepts at most 8 KB, rejects unknown properties, and never accepts `open`:

```json
{
  "inboxItemId": "inbox:task:task%3Aexample",
  "intent": "complete",
  "requestId": "inbox-request-example-001",
  "expectedUpdatedAt": "2026-07-17T15:30:00.000Z"
}
```

Snooze also requires `snoozeUntil`, no more than one year ahead. Date-only values use Eastern end-of-day semantics. Success returns only `ok`, intent, Inbox item ID, outcome, founder-facing message, exact source `href`, `alreadyApplied`, and refreshed authorized counts. It returns no state graph, source record, permission, operation name, audit record, provider response, secret, token, path, or stack.

## Source action matrix

| Source family | Projected source | Inbox action | Existing authority/evidence | Result |
| --- | --- | --- | --- | --- |
| Explicit company decision | `approvals` linked to `queueItems` | Approve | `transitionQueueItem`; existing approval capability; Approval upsert plus one company event | Wired; Snooze deferred because the Approval remains authoritative after a linked queue-only snooze |
| Company Inbox item | `queueItems` | Approve when approval is required; Complete otherwise; Snooze | `transitionQueueItem`; existing Task/Growth/approval capability chosen from projected work; one company event | Wired |
| Task, including a follow-up represented by a Task | `tasks` | Complete | `updateTaskInState`; existing Task capability; one audit record and one activity event | Wired |
| Legacy domain approval | `approvalQueue` | Approve | Current helper is server-local and Post-specific, not a reusable domain boundary | Deferred: Open only |
| Direct Social review | `posts` | Approve | Direct review needs its existing guideline/context path; queue-backed Social approval is wired above | Deferred: Open only |
| Direct Campaign decision | `campaigns` | Approve | No reusable approval-only operation exists without release/launch context | Deferred: Open only |
| Suggested change | `automationSuggestions` | Approve | Current approval also applies the suggestion | Deferred: Open only |
| Partner follow-up | `partners` | Complete | Direct completion risks Partner state; only a linked Task/queue item may complete | Deferred: Open only |
| Reply/intelligence follow-up | `inboxSignals` | Complete | No reviewed completion boundary independent of reply handling exists | Deferred: Open only |
| File/evidence update | file/evidence sources | Complete or Approve | Direct mutation could alter File status/sharing; only a linked Task may complete | Deferred: Open only |
| Explicit decision or Task snooze | `approvals`, `tasks` | Snooze | Neither authoritative record has a reviewed normalized exact-date snooze operation | Deferred: Approve/Complete/Open only |

Updates are Open-only. Waiting items are Open-only after their current transition.

## Approval and execution separation

Approve changes only the existing queue decision and Approval evidence. It never sends, publishes, launches/releases/resumes a Campaign, enrolls recipients, applies automation, changes a Partner stage, shares a File, changes suppression/live gates, or calls a provider. Queue-backed Social or Campaign decisions remain approval records awaiting their separately gated executor.

The confirmation says: “This records your approval. It does not send, publish, launch, or release anything.” Dismissal and Escape are never approval.

## Complete and Snooze

Company completion calls `transitionQueueItem(..., status: "completed")`. Task completion calls `updateTaskInState(..., "done")`. A linked Partner Task changes only that Task. Only a true completed source state returns `alreadyApplied`; an unrelated terminal state is not mislabeled as completion.

Only Company Memory queue items use Snooze. The UI offers Tomorrow, Next week, and Choose a date. The service validates and normalizes the date and calls the existing `snoozed`/`snoozedUntil` transition. It adds no Inbox-only hiding, due date, field, collection, or Task snooze.

## Idempotency, concurrency, and stale state

The UI allows one in-flight mutation per item and disables controls synchronously. The server serializes the current read/transition/write and relies on authoritative state transitions rather than a new idempotency collection.

An identical retry after success resolves the same stable item in Waiting/Updates, recognizes the applied source state, returns `alreadyApplied: true`, and writes no Approval or event. A stale version or item changed in another tab returns “This item changed. Refresh Inbox and try again,” creates zero transition, and triggers one compact refresh. A later state is never overwritten.

## Audit and activity

The adapter adds no generic Inbox audit. A queue approval/completion/snooze creates the same one `companyEvents` decision as the existing operation. Approval updates or creates the one linked Approval. Task completion creates the existing one Task audit record and one activity event. Authorization, validation, unsupported, stale, and temporary failures create no evidence or success claim.

## UI, feedback, refresh, and badge

Every row retains Open. The compact authorized response may also declare Approve, Complete, or Snooze. Approve/Complete is primary, Open secondary, and Snooze quiet. Unsupported records show no dead control.

Approve and Snooze use a labelled modal dialog with Cancel, Escape dismissal, and focus return. Snooze has labelled dates and inline validation. Complete changes its label to Working immediately. No action optimistically removes an item or changes counts.

Success focuses a visible status, performs one compact Inbox refresh, preserves safe group/filter state, and updates the Needs me badge from refreshed counts without a separate badge or full-state request. Temporary failure keeps the item and offers one safe Retry with the same request ID. Session expiration closes dialogs, clears sensitive values/page data/badge through CCX-105. Recovery Mode closes the layer and clears the badge.

## Authorization, security, and privacy

The endpoint requires an authenticated vNext account with existing internal read access, then the service reauthorizes the domain capability derived from the server projection. Forged HTML cannot create availability, hidden IDs disclose no existence, and restricted roles act only on their authorized projection.

The adapter exposes no raw capability, collection, endpoint, status, private URL, email body, legal record, provider data, OAuth value, secret, stack, or diagnostic text. Source text remains DOM `textContent`; no action data is stored in browser storage.

## Accessibility and responsive behavior

Actions have contextual names, 44-pixel targets, visible focus, live Working/success/failure text, and no color-only state. Native modal focus is contained; Escape returns focus. At 390 pixels the dialog and Snooze choices use a full-width mobile-safe treatment without overlapping navigation, Search, Create, Profile, or Le-E.

The isolated Chromium gate requires zero serious/critical axe findings, zero unexpected console/page errors, no failed critical request, and no horizontal overflow at 1440, 1024, 768, or 390 pixels.

## Performance and safety measurements

The focused local fixture measured a 2.627 ms projection rebuild and 3.661–11.107 ms action computations with 252–319 byte compact bodies. The isolated browser run measured Approve at 146 ms/341 bytes, Task Complete at 313 ms/274 bytes, Queue Complete at 258 ms/327 bytes, and Snooze at 104 ms/337 bytes. Each success refreshed Inbox once with zero separate badge or full-state request. These are local fixture results, not hosted claims.

Each successful source action performs one scoped storage write call containing only changed domain collections. Duplicate, stale, unauthorized, validation, and failure results write nothing. Sends, publications, Campaign execution/enrollment, provider calls, Partner/File state changes, suppression changes, and live-gate changes remain zero.

## Legacy behavior, rollback, and CCX-203 handoff

Flag-off rendering remains byte-for-byte unchanged. The 75 canonical routes, 53 aliases, exact links, static routes, OAuth callbacks, legal pages, imports, and legacy actions remain intact.

Rollback removes the action registry/service/UI, POST branch, compact action declarations, CCX-202 evidence, and the narrow non-approval queue Complete declaration. No migration, conversion, idempotency cleanup, or Inbox record cleanup exists; successful source changes remain valid because they used existing domain operations.

CCX-203 may define the Today view model only after CCX-202 review and merge. It may consume compact authorized Inbox summaries/exact links, but must not copy this registry, projection, or domain transitions. CCX-202 does not begin or redesign Today.
