# Universal Inbox page

Status: CCX-201 read contract with CCX-202 action integration
Route: `#inbox`
Read endpoint: `GET /api/ui/inbox`
Mutation adapter: `POST /api/ui/inbox/action` (see `inbox-actions.md`)

## Objective and architecture

The vNext Inbox is one action-oriented read surface for work that needs attention, truthful waiting conditions, and meaningful recent updates. It consumes the frozen CCX-200 `buildInboxView(state, actor, now)` result. The page, compact response builder, and browser renderer do not duplicate source state machines, work classification, deduplication, priority normalization, authorization, or exact-link policy.

The implementation is split into small layers:

- `scripts/ui/view-models/inbox-page-view.mjs` filters and paginates an already-authorized projection into a recursively frozen compact response.
- `scripts/inbox-page-service.mjs` composes the CCX-200 projection with the compact page view.
- `scripts/ui/pages/inbox-page.mjs` supplies static page markup and safe DOM rendering.
- `GET /api/ui/inbox` authenticates, authorizes, reads current state once, supplies one server timestamp, and invokes the service.
- `assets/ui/inbox-page.css` provides the responsive work-list presentation.

There is no Inbox collection, migration, page-specific source cache, Inbox business engine, or generic mutation endpoint. CCX-202 adds only a narrow adapter to existing queue and Task operations.

## Route and shell placement

`#inbox` is a vNext-only utility route. It activates the secondary Inbox control and never becomes a sixth primary destination. The primary destinations remain exactly Today, Social, Outreach, Partners, and Files.

The route accepts a vetted hash query such as `#inbox?group=needs-me&type=task&priority=high`. It uses the shared CCX-102 parser, encoding, safe-hash, route-access, exact-link, and unknown-route contracts. Existing bookmarks to Decisions, Tasks, the Social queue, Automation, captured follow-ups, and every other legacy route remain unchanged. Flag-off rendering and unknown-route behavior remain byte-for-byte unchanged.

## Relationship to the CCX-200 projection

The server calls `buildInboxView` before page filters or pagination. Hidden records are therefore removed before counts, filter options, result counts, item data, and cursors exist. The compact page view translates `workKind` to a founder-facing type label but does not reclassify work or expose `sourceKind`, `sourceId`, `workKind`, `dedupeKey`, or declarative action intents to visible page copy.

Projection items retain their exact `id`, title, summary, dates, owner, priority, approval flag, related-object reference, and exact `href`. The page uses the projection summary as its authoritative explanation.

## Compact endpoint

`GET /api/ui/inbox` supports:

- `group`: `needs-me`, `waiting`, or `updates`;
- `type`: a safe founder-facing type key;
- `priority`: `urgent`, `high`, `normal`, or `low`;
- `owner`: an authorized owner label;
- `due`: `overdue`, `today`, `upcoming`, or `none`;
- `limit`: default 30, maximum 40; and
- `cursor`: deterministic `inbox-<offset>` continuation within the same authorized filter set.

The endpoint requires the existing `read_internal` capability at the server boundary. It then constructs the existing actor summary and invokes the CCX-200 source-level visibility policy. It returns no full application state, full source record, capability list, hidden count, provider payload, body text, storage path, secret, token, or diagnostic detail. Invalid groups, cursors, priorities, due states, and unsafe filter text fail closed with compact founder-safe errors.

The response contains generated time, selected group, the three authorized group counts, authorized filter options, filtered result count, compact items, and bounded pagination state. Filters are applied only after projection authorization.

## Groups and counts

The page always displays exactly these tabs in order:

1. Needs me
2. Waiting
3. Updates

Needs me is the default. Empty groups stay selectable. `aria-selected`, roving tab focus, Arrow keys, Home, and End provide accessible keyboard navigation. Safe hash state preserves Back and Forward behavior.

Tab counts always show total authorized items in each group. Filters never replace those values with filtered counts; an independent live result summary reports the current filtered count. No count includes hidden records.

## Filters

Type, Priority, Owner, and Due state options are derived only from authorized projected items. Type labels never expose source or work discriminator values. Priority labels are Urgent, High, Normal, and Low. Owner labels are founder-facing; Unassigned appears only when an authorized item is actually unassigned. Due state uses the supplied server time and existing Eastern date semantics without inventing dates.

Filters combine deterministically, stay in the safe hash query, and never use local or session storage. Clear filters removes all four filters while preserving the selected group. Filter changes issue one compact Inbox read and never fetch full state.

## Item anatomy and exact Open behavior

The page is a semantic ordered work list, not a card dashboard. Each row includes only useful nonempty data:

- founder-facing type and normalized priority;
- concise title and authoritative explanation;
- owner;
- due/waiting date and useful update time;
- approval-required context when true;
- restrained source-action context when useful; and
- Open.

Open is an ordinary exact hash link from CCX-200. It opens the authoritative record, creates no mutation, and preserves browser Back navigation. Source-derived text is assigned through DOM `textContent`; no source HTML is inserted.

CCX-202 keeps Open exact and adds Approve, Complete, or Snooze only when the compact server-authorized registry declares a reviewed source operation. Unsupported records and Updates remain Open-only; no disabled future control is shown. The client submits only the stable Inbox ID, intent, request ID, rendered version, and a real snooze date when required. Full safety behavior is documented in `inbox-actions.md`.

## Shell badge

The desktop sidebar and responsive drawer share the same Inbox badge node and authorized Needs me count. The badge is visible only above zero and uses the restrained orange treatment. Waiting and Updates never inflate it.

Outside Inbox, the shell requests `GET /api/ui/inbox?group=needs-me&limit=1`; it never reads full state for the badge. A pending request is reused and a completed count is cached. On Inbox, the page response supplies the same count, avoiding a second badge request. Inbox refresh and a safe transition back to Inbox refresh it. Session expiration and Recovery Mode clear it immediately.

## Loading, error, authorization, and session states

- Loading preserves the complete shell and shows an Inbox-specific `aria-busy` state without fake items or delay.
- Read error states say “Inbox could not load. No records were changed. Try again.” and offer Try again and Go to Today.
- Retry preserves safe group/filter state, reuses the server authorization boundary, retries only the GET read, and suppresses duplicate activation.
- Unauthorized states render no item or count first and use founder-facing additional-access copy without protected details.
- Session expiration delegates to the CCX-105 session-ended state, clears page data and the badge, closes authenticated layers, and keeps the vetted sign-in path.
- Recovery Mode clears any stale actionable badge and preserves CCX-105 “Publishing is off.” behavior.

## Empty states

- Needs me: “You’re caught up” and “Nothing needs your attention right now,” with safe navigation to Today, Social, and Outreach.
- Waiting: “Nothing is waiting” and a truthful explanation that no item is waiting on another person or future date.
- Updates: “No recent updates” and a statement that meaningful progress appears as work moves.
- Filtered: “No matching items,” guidance to change or clear filters, and Clear filters.

None of these states imply that hidden unauthorized work does or does not exist.

## Pagination

The default page size is 30 and the maximum is 40. Cursors are bounded, deterministic, and validated. Load more preserves group and filters, disables itself while pending, and appends only unseen stable item IDs. The page never renders an unbounded group.

## Responsive behavior

At 1440, 1280, and 1024 pixels the page uses a readable single work list, compact filters, and visible orientation. At 768 and 390 pixels the header and metadata stack, each Open control stays reachable, the four filters become a practical vertical form, and group tabs remain visible without horizontal scrolling. Touch controls are at least 44 pixels. Search, Create, Help, Profile, Le-E, and the existing mobile drawer remain available.

## Accessibility

The shell retains one semantic `main`; the page adds one `h1`, a labelled tablist, labelled filters, polite result-count announcements, ordered-list semantics, explicit priority text, useful status/error regions, visible focus, reduced-motion handling, and contextual Open names such as “Open … in Social post.” Color is never the only status signal.

Playwright checks the page with axe at the required widths and requires zero serious and zero critical violations, zero unexpected console/page errors, and no page-level horizontal overflow.

## Authorization and privacy

The browser never grants visibility. The server endpoint and CCX-200 projection enforce the existing role, capability, owner, and record-visibility rules before compacting data. Exact links remain subject to CCX-105 route reauthorization and cannot disclose unavailable record existence.

The page does not expose hidden titles, IDs, summaries, counts, raw capability values, provider details, full message bodies, legal records, private URLs, OAuth data, stack traces, collection names, or internal status vocabulary. Filter options and empty results are authorized subsets and cannot be used as an existence oracle.

## Performance and no-mutation guarantee

The deterministic focused production-like fixture projects 129 authorized items and returns a 30-item compact page in 82.729 ms and 17,682 bytes on the reference local run. The browser fixture remains below the 750 ms endpoint target and typical response target of 100 KB. These are local isolated measurements, not hosted claims.

The projection and page view perform zero network requests and zero writes. Opening, filtering, paginating, retrying the read, and leaving Inbox remain authenticated GET-only behavior. An explicit CCX-202 action may perform one existing scoped source transition; it never executes sends, publications, Campaign execution, provider actions, enrollment, Partner/File state changes, suppression, or live-gate changes.

## Legacy behavior and rollback

Flag-off mode does not load the route, endpoint UI client, stylesheet, or badge logic into the rendered legacy shell. The 75 canonical legacy routes, 53 aliases, static routes, OAuth callbacks, APIs, legal pages, import route, and legacy unknown-route behavior remain intact.

Rollback removes the CCX-201 page/view/service modules, endpoint branch, stylesheet, focused/browser tests, documentation, and the vNext `inbox` utility route entry, then points the vNext secondary Inbox link back to Decisions. No migration, state repair, cache cleanup, or source rollback is required.

## CCX-202 integration and CCX-203 handoff

The reviewed action registry, wired/deferred matrix, endpoint, idempotency, evidence, and no-execution guarantees are documented in `inbox-actions.md`. CCX-203 may use compact authorized Inbox summaries when defining Today, but must not duplicate projection or action rules. CCX-203 is unblocked only after CCX-202 review and merge.

## CCX-204 Today integration

The refined Today page consumes only CCX-203 summaries derived from this projection. Needs You shows the full Needs me count and at most three supplied references after Now/Next exclusion; it does not copy filters or action dialogs. Progress uses supplied current-week Updates and links to `#inbox?group=updates`. Open Inbox uses `#inbox?group=needs-me`; shell badge ownership, pagination, and CCX-202 action execution remain entirely here. See `today-page.md`.
