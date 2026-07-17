# Today view model

## Objective

CCX-203 defines the compact, read-only projection that will let a later Today interface answer four questions: what should I do now, what are the next three things, what needs me, and what moved forward. It does not replace or alter the current Today page. CCX-204 owns the refined interface and its reviewed Start/Open presentation.

The public entry point is `buildTodayView(state, actor, now)` in `scripts/ui/view-models/today-view.mjs`. The function is pure, deterministic, authorization-aware, and based only on its explicit arguments. The supplied `now` is the sole clock authority.

## Normalized contract

The immutable result contains:

- `generatedAt`: the normalized supplied time.
- `nowItem`: zero or one compact work item.
- `nextItems`: no more than three compact work items.
- `needsMeSummary`: authorized Needs me totals and up to three additional exact references.
- `progressSummary`: meaningful authorized movement in the current Eastern business week.

The model returns no full state, full Inbox group, full source record, provider payload, audit payload, permission token, secret, or executable action.

## Work-item contract

Now and Next use stable CCX-200 identity and this compact shape:

```text
id, dedupeKey, objectType, title, summary, whyNow, priority,
dueAt, updatedAt, owner, href, destination, sourceKind, sourceId
```

`id` and `dedupeKey` come from the authorized Inbox projection. `priority` remains one of `urgent`, `high`, `normal`, or `low`; an overdue item is not promoted to urgent. Dates are normalized timestamps or empty strings. `href` remains the exact CCX-200 safe link. `sourceKind` and `sourceId` are internal references for a future server boundary and are not founder-facing labels.

The projection contains no mutation intent. Open/Start remains exact navigation for CCX-204 to present; this packet does not add Send, Publish, Launch, Release, Resume, Approve, Complete, Snooze, or any new action adapter.

## Now selection

Now contains exactly zero or one item:

1. A current, non-stale Daily Run item wins only when its snapshot ID resolves to exactly one currently authorized CCX-200 Needs me item.
2. Otherwise, an exact current Morning Brief first-move reference may promote its one authorized source item.
3. Otherwise, the highest-ranked authorized Needs me item wins.
4. With no actionable authorized candidate, Now is `null`.

The Daily Run session remains authoritative and unchanged. A session is current only when it is active, started on the current Eastern date, and was active within the existing eight-hour window. Completed, abandoned, prior-day, invalid, cleared, parked, and skipped work cannot win. A snapshot item in an advanced/internal bucket is excluded. Selecting Now never starts, resumes, completes, parks, or otherwise changes the session or source item.

The existing Morning Brief producer currently stores mostly text and route-level hints. The adapter recognizes an explicit source-reference object only; it never matches `suggested_first_move` or other prose by title. This preserves a safe path for authoritative fixtures or future records without guessing from current text-only rituals.

## Next selection and ranking

Next contains the first three remaining actionable candidates after Now. Waiting, Updates, terminal work, hidden work, and advanced/internal system cards are never candidates. Fewer than three truthful candidates produces fewer than three results.

The deterministic comparator applies:

1. Exact current Daily Run promotion.
2. Exact current Morning Brief first-move promotion.
3. Normalized priority: urgent, high, normal, low.
4. Overdue, due today, upcoming, then no date within that priority tier.
5. Earliest real due date.
6. Most recently updated.
7. Stable title.
8. Stable item ID.

All Needs me candidates are already actor-actionable under CCX-200. Input array order is never a tie-breaker. The current Focus UI has derived modes but no reliable persisted source rank, so CCX-203 does not invent or persist a competing score.

## Deduplication

CCX-200 dedupe keys define underlying Inbox work. Daily Run and Morning Brief references only annotate or promote that existing item; they never add a second candidate. Now and Next are selected once from the same deduplicated candidate set.

An exact Daily Run/Task/Inbox relationship therefore collapses to one Today item. Distinct Tasks on one Partner and distinct decisions on one Campaign remain separate because their explicit CCX-200 dedupe keys remain separate. The model never deduplicates by title, fuzzy text, or timestamp coincidence. Ambiguous source references are deferred.

## Needs me summary

`needsMeSummary` is built from the merged authorized CCX-200 Needs me projection:

```text
count, urgentCount, highCount, topItems, href
```

`count` is the full authorized Needs me count, including items already represented in Now or Next. `urgentCount` and `highCount` use CCX-200 normalized priorities. `topItems` contains at most three compact exact references after excluding Now and Next. It can be empty while the total remains nonzero. `href` is `#inbox?group=needs-me`.

Hidden work never affects totals, priority counts, ranking, or references. Today does not copy Inbox filters, pagination, groups, or action dialogs.

## Progress summary

`progressSummary` answers what moved forward using the authorized CCX-200 Updates projection as its only business source:

```text
available, periodStart, periodEnd, count, items, href
```

`periodStart` is Monday at 00:00 in `America/New_York` for the business week containing supplied `now`. `periodEnd` is supplied `now`. Only updates with a real `updatedAt` inside that closed interval are included. Items are deduplicated by authoritative `sourceKind:sourceId`, ordered newest first with stable source identity tie-breakers, and capped at five. `count` remains the full authorized, deduplicated current-week total. `href` is `#inbox?group=updates`.

For an authorized actor, `available` distinguishes an explicitly supplied source graph from unavailable source collections. It is always false for an unauthorized actor so source availability cannot disclose protected existence. A supplied but empty authorized graph truthfully has count zero. The model does not fabricate progress percentages, revenue, engagement, completion rates, or Partner outcomes.

CCX-200 already excludes stale updates and does not project low-value audit noise, health pings, diagnostic runs, data-integrity refreshes, telemetry, or raw provider syncs. CCX-203 narrows that authorized update set to the current Eastern week and does not read raw audit/activity ledgers as a second source.

## Daily-planning source matrix

| Current source | Actual collection or projection | Today purpose | Authoritative condition | Ranking role | Dedupe identity | Exact-link strategy | Permission boundary | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Universal Inbox Needs me | CCX-200 `buildInboxView` | Now, Next, Needs me | Authorized `needs_me` item | Base actionable ordering | CCX-200 `dedupeKey` | CCX-200 `href` | CCX-200 filters before counts | Included |
| Daily Run active item | `dailyRunSessions.bucket_snapshot` | Resume current work | Current session plus one exact authorized Inbox source match | Highest promotion | Matching CCX-200 dedupe key | Matching CCX-200 `href` | Match only after authorized Inbox projection | Included when exact; otherwise deferred |
| Morning Brief first move | `morningBriefs` | Preserve an explicit first move | Current Eastern date plus explicit source-reference object and one match | Second promotion | Matching CCX-200 dedupe key | Matching CCX-200 `href` | Match only after authorized Inbox projection | Included when exact; current text-only records deferred |
| Focus-ranked work | Current Today client-derived focus lanes | Potential focus hint | No persisted authoritative rank/source relationship exists | None | Unreliable | Route-level only | Client display is not authority | Deferred |
| Tasks due today / this week | `tasks`, as represented by CCX-200 | Actionable task work | CCX-200 important/high/urgent and actor-actionable condition | Normal Needs me rank | `task:<id>` | Exact generic Task link | Existing Task visibility and capability policy | Included through CCX-200; other normal scheduling views deferred |
| Daily Closeout tomorrow plan | `dailyCloseouts` | Carry-forward planning | Current records contain text/route hints, not a reliable exact source pointer | None | Unreliable | Route-level only | Ritual visibility does not grant source access | Deferred |
| Operating Memory carry-forward | `operatingMemory` | Carry-forward planning | Current records contain derived text/route hints | None | Often title-derived | Route-level only | Memory text is not source authorization | Deferred |
| Milestones | `milestones` and source-domain movement | Progress context | Only when represented by an authorized CCX-200 update | Update ordering | CCX-200 source identity | CCX-200 exact link | Existing source visibility | Included through Updates; standalone ambiguous milestones deferred |
| Meeting preparation | `meetingBriefs` | Possible actionable preparation | No CCX-200 actionable mapping or reliable exact relationship | None | Unreliable | Route-level only | Read-only meeting data is not action authority | Deferred |
| Calendar items | current read-only calendar sources | Scheduling context | No reviewed actionable Today relationship | None | Unreliable | Route-level only | Existing read-only policy | Deferred |
| Universal Inbox Updates | CCX-200 `buildInboxView` | Current-week progress | Authorized update with real in-week timestamp | Newest first | `sourceKind:sourceId` | CCX-200 `href` | CCX-200 filters before progress count | Included |

Planning documents are not rendered as duplicate work. If a future Morning Brief, Closeout, or memory record gains a reviewed exact source reference, it may only promote the matched source work; the ritual record itself must not become a second item.

## Advanced/internal exclusions

Normal Today excludes Daily Run buckets for blocked live systems, RCAP/watch work, and paused/future work, plus item types identified as diagnostic, telemetry, system-health, data-integrity, live-gate, audit, self-check, or RCAP work. If such a bucket is the active Daily Run bucket, CCX-203 falls back to authorized ordinary work rather than exposing the internal item. It does not mutate, skip, or advance the Daily Run.

## Authorization and exact links

Authorization occurs inside CCX-200 before Today ranks, counts, or resolves planning references. A missing actor, unknown role, forged permission list, unauthenticated actor, or actor without existing internal-read authority receives no items or counts. A Daily Run or ritual reference cannot reveal a hidden source because it is resolved only against already-authorized candidates. Source identifiers are never accepted as client authority in this pure model, and exact links do not bypass normal route authorization.

The browser remains a presentation consumer, never the authorization authority. Founder-facing fields reuse sanitized CCX-200 titles, summaries, owners, and normalized labels; internal collection and capability names remain out of visible text.

## Side-effect and performance guarantees

The module imports only pure Inbox projection helpers. It imports no storage, database, server, task engine, Daily Run engine, network/provider, sending, publishing, or browser layer. It reads no `process.env`, browser global, storage, or current wall clock. It performs no network request, storage write, audit write, source mutation, action execution, or persistence of ranking decisions. Returned objects and arrays are deeply frozen, and input state is never mutated.

The focused production-like fixture measures candidate records examined, authorized candidates, deduplication, output counts, elapsed in-memory projection time, serialized size, network requests, storage writes, and input mutations. The target is below 100 ms, substantially below 100 KB, and zero for all side effects.

## No-user-visible-change guarantee

CCX-203 adds no Today endpoint, renderer import, route, HTML, CSS, browser module, screenshot, badge behavior, Quick Capture behavior, or Daily Run behavior. A focused byte comparison protects the existing Today renderer block, and the browser suite protects current runtime behavior. The five primary destinations, 75 canonical legacy routes, 53 aliases, and flag-off shell remain unchanged.

## Rollback and CCX-204 handoff

Rollback removes the Today view-model module, its focused test and package script, and this document. No data rollback is required because CCX-203 adds no collection, migration, write, or runtime wiring.

After review and merge, CCX-204 can consume the compact model to refine the Today interface. CCX-204 must retain server-authoritative authorization, exact navigation, the four-question hierarchy, and all no-mutation guarantees; it must separately review any Start/Open presentation. CCX-203 does not begin that interface work.

## CCX-204 consumption

The merged model is now consumed by the vNext-only service documented in `today-page.md`. That service invokes `buildTodayView` once per authenticated read, removes internal identity fields from the wire response, and adds presentation-only Start/Resume labels without changing rank or source state. The no-visible-change guarantee above remains the historical CCX-203 packet guarantee; CCX-204 is the separately flagged renderer that introduces the reviewed page.
