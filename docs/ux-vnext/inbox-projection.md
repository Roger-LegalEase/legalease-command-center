# Universal Inbox projection

Status: CCX-200 contract
Scope: pure view-model projection only
User-visible page: none in this packet

## Purpose

`buildInboxView(state, actor, now)` computes one permission-aware view of work that genuinely needs human attention, truthful waiting conditions, and meaningful recent movement. It lets later packets present one Inbox without replacing the existing decision, social, campaign, Partner, task, automation, reply, support, or file engines.

The projection reads the current authoritative records and translates them into a stable founder-facing contract. It never changes those records.

## Why there is no Inbox collection

An Inbox collection would create a second state machine and invite drift: a task could be complete in the task engine but still open in Inbox, or a Campaign could be approved in one place and pending in another. CCX-200 therefore introduces no collection, migration, write path, API endpoint, browser cache, or persistence rule.

The projection is disposable. Rebuilding it from the same explicit inputs produces the same output. Deleting a computed result loses no domain truth.

## Normalized view contract

```js
{
  generatedAt,
  actor: { id, displayName } | null,
  groups: {
    needsMe: [],
    waiting: [],
    updates: []
  },
  counts: {
    needsMe,
    waiting,
    updates,
    total
  }
}
```

`generatedAt` is the normalized supplied `now`. The actor summary never contains permissions or capability identifiers. A missing, unauthenticated, unknown-role, or aggregate-only actor receives an empty projection.

The three group keys are inserted in this exact order and no fourth group is supported.

## Normalized item contract

```js
{
  id,
  dedupeKey,
  sourceKind,
  sourceId,
  workKind,
  title,
  summary,
  group,
  priority,
  dueAt,
  updatedAt,
  owner,
  requiresApproval,
  href,
  relatedObject,
  actionIntents
}
```

- `id` is `inbox:<work-kind>:<encoded-dedupe-key>` and is stable for unchanged source work.
- `dedupeKey` is the reviewed identity of the human decision or action, not a title or timestamp coincidence.
- `sourceKind` and `sourceId` identify the winning authoritative record. They are internal fields, not normal visible copy.
- `workKind` is one of the smallest source-backed set currently required: `decision`, `social_review`, `campaign_decision`, `partner_followup`, `task`, `automation_review`, `reply_followup`, or `file_update`.
- `title` and `summary` are compact founder-facing text derived from authorized source truth.
- `group` is exactly `needs_me`, `waiting`, or `update`.
- `priority` is exactly `urgent`, `high`, `normal`, or `low`.
- `dueAt` and `updatedAt` are valid ISO values or empty strings.
- `owner` is a safe display label or empty. It never exposes a role or capability token.
- `requiresApproval` reflects the current source state; the projection never invents an approval.
- `href` is a CCX-102 exact link. Candidates without a safe exact link fail closed.
- `relatedObject`, when present, contains only `objectType`, `id`, and `href`.
- `actionIntents` are declarative hints. They do not execute anything.

The returned object, nested objects, item objects, and arrays are recursively frozen.

## Exact three groups

### Needs me

An item enters `needs_me` only when the current actor has the existing source-domain capability, the record is visible, the work is assigned appropriately, and a current action exists.

Examples supported by current schemas include a requested decision, a post explicitly needing review, a Campaign ready for a reviewed decision, an assigned Partner follow-up whose date has arrived, an important assigned Task, a pending automation suggestion, an owner reply signal, and a file whose reviewed update is due.

Priority alone does not make an item actionable. An overdue normal Task is not promoted into the projection merely because its date passed.

### Waiting

`waiting` requires an explicit source truth: another owner, an external response, a blocker, a snooze, a future action date, a scheduled state, an approved decision awaiting execution, or a paused source-domain state.

The projection does not invent waiting from vague summary text.

### Updates

`update` contains meaningful terminal or milestone movement with an authoritative timestamp: an executed or rejected decision, a published post, a completed Campaign, a Partner response or milestone, a completed important Task, an applied automation suggestion, a resolved reply/support signal, or a reviewed file becoming current.

The current recency window is seven days, inclusive, measured against supplied `now`. Future timestamps do not count. Ordinary audit/activity rows and routine `updatedAt` churn do not become Updates.

## Source matrix

| Source family | Actual collection/projection | Human-work condition | Group | Authoritative state | Dedupe identity | Exact-link strategy | Permission boundary | Included or deferred |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Company decisions | `approvals` | `requested`; `approved` awaiting the reviewed executor; recent `rejected`, `executed`, or `verified`; `failed` needing review | Needs me, Waiting, Updates | Approval state plus linked existing `queueItems` record | Linked domain decision identity and action scope | Exact linked source object; existing generic item link only when the collection is supported | Existing `read_internal`, record visibility, and `manage_approval_queue` | Included |
| Company decisions | `queueItems` | `needs_roger`; approval-bearing `new`/`drafted`; explicit `blocked`, `snoozed`, `scheduled`, or `approved`; recent `completed` | Needs me, Waiting, Updates | Existing Company Memory decision projection; domain record remains authoritative | Linked `sourceRef` plus reviewed action scope | Exact linked record, otherwise reviewed generic item link | Existing read visibility and source capability; `needs_roger` is owner-actionable | Included |
| Domain approvals | `approvalQueue` | Open statuses `queued_for_approval`, `needs_review`, `ready_to_approve`, `new`, `pending`, or `blocked`; explicit snooze/schedule; recent approval/rejection | Needs me, Waiting, Updates | Current domain approval status | Linked Post/Campaign decision identity when explicit, otherwise approval record ID and scope | `#item/approvalQueue/<id>` with compact related object where available | Existing read visibility and `manage_approval_queue` | Included |
| Social review | `posts` | `needs_review`; explicit retry/block; approved post missing final image/preview; approved post needing a schedule decision; scheduled post; recent publication | Needs me, Waiting, Updates | Post status and reviewed readiness fields | Post ID plus current action scope (`review`, `visual`, `schedule`, `delivery`, or `published`) | `#social/post/<id>` | Existing visibility and `manage_content_drafts` | Included |
| Campaign decisions | `campaigns` | Compliance review; Partner approval wait; `ready` or explicit approval state; paused/blocked/scheduled/waiting; recent explicit launch/completion timestamp | Needs me, Waiting, Updates | Campaign status, compliance status, Partner approval status, and explicit milestone timestamp | Campaign ID plus decision scope | `#outreach/campaign/<id>` | Existing visibility, `manage_growth`, and source owner | Included |
| Campaign release/resume | Existing `approvals` + `queueItems` linked to `reactivationCampaign` | Requested release/resume, approved action waiting to run, or recent execution | Needs me, Waiting, Updates | Campaign Command approval and decision records | Reactivation source identity plus `release` or `resume` scope | Existing generic exact item/source link | Existing decision permissions | Included through decision adapters |
| Partner follow-up | `partners` | Explicit `nextAction` or blocker with a recorded owner; future follow-up; recent explicit response/milestone | Needs me, Waiting, Updates | Partner owner, next action, due date, blocker, and response/milestone timestamps | Partner ID for current follow-up; Partner ID plus milestone timestamp for a distinct update | `#partners/partner/<id>` | Existing visibility, `manage_growth`, and owner assignment | Included |
| Important Tasks | `tasks` | Open/in-progress high, urgent, or explicitly important Task; explicit `waiting`/`blocked`; recent `done` | Needs me, Waiting, Updates | Task status, owner, priority, due date, and completion timestamp | Task ID | `#item/tasks/<id>` | Existing visibility and `manage_tasks`; owner assignment for Needs me | Included |
| Automation review | `automationSuggestions` | `pending`/`edited`; recent `applied` | Needs me, Waiting, Updates | Suggestion status; source engine remains authoritative | Suggestion ID | `#item/automationSuggestions/<id>` | Existing visibility and `manage_autonomy` | Included |
| Reply intelligence | `inboxSignals` | Supported suggested kinds (`needs_reply`, `went_quiet`, `commitment`, `pipeline_inbound`); explicit snooze; recent resolution | Needs me, Waiting, Updates | Signal kind, sticky status, due date, owner-only visibility | Signal ID | `#item/inboxSignals/<id>` | Existing record visibility; Needs me is owner-only | Included |
| Captured follow-up | `growthInbox` | `new`/`triaged` with explicit `human_review_required`, `roger_decision`, or `operator_triage`; recent conversion | Needs me, Waiting, Updates | Capture status, decision need, owner, and due date | Capture record ID | `#item/growthInbox/<id>` | Existing visibility, `manage_growth`, and owner assignment | Included |
| Support follow-up | `supportIssues` | `open`/`drafted`; explicit `waiting`; recent `resolved`/`closed` | Needs me, Waiting, Updates | Support status, urgency, sensitivity, and resolution timestamp | Support record ID | `#item/supportIssues/<id>` | Existing visibility and mutation authorization | Included |
| Reports | `reports` | Explicit review/update state; recent explicit approval/review | Needs me, Waiting, Updates | Report status/review state and reviewed timestamp | Collection plus report ID | `#files/report/<id>` | Existing visibility, private-asset view, and reviewed update capability | Included |
| Investor Room files | `dataRoomItems` | Explicit `needs_update`, `outdated`, `expired`, review state, blocker, or recent explicit current state | Needs me, Waiting, Updates | File status/review state and dates | Collection plus file ID | `#files/data-room-item/<id>` | Existing visibility and private-asset/update capabilities | Included |
| Evidence notes | `evidencePackNotes` | Explicit review/update state or recent reviewed completion | Needs me, Waiting, Updates | Evidence-note status/review state | Collection plus note ID | `#files/evidence-note/<id>` | Existing visibility and private-asset/update capabilities | Included |
| SOC 2 evidence | `soc2Evidence` | Ready/rejected review state, overdue `nextCollectionDue`, blocker, or recent explicit reviewed completion | Needs me, Waiting, Updates | Evidence status, next collection date, and reviewed timestamp | Collection plus evidence ID | `#files/soc2-evidence/<id>` | Existing visibility and private-asset/update capabilities | Included |
| SOC 2 policy | `soc2Policies` | Approval/review state, due `nextReviewDate`, blocker, or recent explicit reviewed current state | Needs me, Waiting, Updates | Policy status, approval state, and review dates | Collection plus policy ID | `#files/soc2-policy/<id>` | Existing visibility and private-asset/update capabilities | Included |
| Raw Google intelligence | `googleInsights` | Schema has suggested classifications but the collection is not in the reviewed CCX-102 exact-item destination contract | — | Google read-only insight | — | No reviewed exact-link strategy in CCX-200 | Existing internal visibility is insufficient without the route contract | Deferred |
| Alerts | `alerts` | Alerts are derived aggregates and frequently restate decision, support, safety, or Partner conditions without a reliable exact source relationship | — | Alert reconciliation state | — | Alert exact link does not reliably preserve the underlying source | Avoid duplicate existence/count disclosure | Deferred |
| Brand assets | `brandAssets` | `approved: false` alone does not prove a current human action, owner, review request, or due date | — | Brand asset record | — | Exact file link exists, but actionability does not | Existing private-asset visibility | Deferred |
| Audit and activity | `auditHistory`, `activityEvents` | General rows are append-only evidence and contain too much low-value operational movement for an Inbox | — | Audit/activity contracts | — | Existing diagnostics only | Existing diagnostic restrictions | Deferred as direct sources |

## Included and excluded states

Included states are enumerated in the matrix and source adapters. Normal completed, archived, dismissed, ignored, healthy, current, exported, connected, or informational records are excluded unless a source-specific meaningful update rule applies inside the seven-day window.

Notable exclusions:

- A Partner with no owner is not guessed into Needs me or Waiting.
- A normal Task does not appear solely because it is overdue.
- A draft file or draft Campaign does not appear merely because it exists.
- A false `approved` flag on a brand asset does not create work.
- Raw titles, email bodies, provider payloads, audit details, and internal diagnostics are not copied into summaries.
- Missing or unsafe source IDs fail closed before projection.

## Priority normalization

Reliable string priorities map as follows:

- `urgent`, `critical`, `p0`, `p1` → `urgent`
- `high`, `important`, `p2` → `high`
- `medium`, `normal`, unknown, or missing → `normal`
- `low`, `minor`, `p4` → `low`

Existing numeric Company Memory priority uses:

- 10 or less → `urgent`
- 11–30 → `high`
- 31–70 → `normal`
- above 70 → `low`

Overdue status does not alter priority.

## Deduplication identity and precedence

Deduplication never uses title text, fuzzy matching, or timestamp coincidence.

Reviewed identities include:

- `social_review:<post-id>[:<decision-scope>]`
- `campaign_decision:<campaign-id>:<decision-scope>`
- `partner_followup:<partner-id>`
- `task:<task-id>`
- `automation_review:<suggestion-id>`
- `reply_followup:<signal-id>`
- `file_update:<collection>:<record-id>`
- a generic decision identity from explicit collection, source ID, and action scope

An explicit relationship is required before records from different collections collapse. A Task linked to a Partner remains its own work item; two Tasks on the same Partner remain separate. Distinct compliance, visual, scheduling, release, resume, or launch decisions on one object retain distinct scopes.

When candidates share a reviewed identity, source precedence is:

1. explicit `approvals` record;
2. explicit `approvalQueue` record;
3. existing linked `queueItems` decision;
4. explicit domain action-required state;
5. explicit Task, follow-up, or capture record;
6. derived meaningful update.

Candidates are ordered by precedence and stable source identity before selection, so input-array order cannot affect the winner.

## Sorting

Group order is Needs me, Waiting, Updates.

Within Needs me:

1. `urgent`, `high`, `normal`, `low`;
2. earliest real due date, with missing dates last;
3. most recently updated;
4. stable title;
5. stable item ID.

Within Waiting:

1. earliest real revisit/due date, with missing dates last;
2. normalized priority;
3. most recently updated;
4. stable title;
5. stable item ID.

Within Updates:

1. most recently updated;
2. normalized priority;
3. stable title;
4. stable item ID.

## Time and Eastern date semantics

The projection never reads the current wall clock. Every recency, due, and waiting decision uses supplied `now`.

Source date-only fields keep their existing Eastern Time meaning. They are returned as end-of-day Eastern ISO timestamps for display/sorting, while “due today” comparisons use the Eastern calendar date rather than waiting until UTC midnight. Sources that already provide an offset or timestamp preserve the same instant.

## Authorization filtering

Filtering happens before deduplication, grouping, sorting, and counting.

The projection:

- validates the actor against the existing role list;
- ignores caller-supplied capability arrays and derives authority from the existing role policy;
- requires `read_internal`;
- reuses `recordVisibleToActor` for source-level role and private/sensitive visibility;
- checks the existing source-domain capability before assigning Needs me;
- checks recorded ownership where the source supports it;
- returns no internal state to missing, unknown-role, unauthenticated, or aggregate-only actors.

Hidden records cannot affect counts, dedupe winners, titles, summaries, IDs, links, or related-object references. This projection does not grant route, Search, or Global Create authority; those policies remain independent.

## Exact links

The projection imports the current CCX-102 builders and does not define a second route parser.

- Post: `#social/post/<encoded-id>`
- Campaign: `#outreach/campaign/<encoded-id>`
- Partner: `#partners/partner/<encoded-id>`
- Report: `#files/report/<encoded-id>`
- Investor Room file: `#files/data-room-item/<encoded-id>`
- Evidence note: `#files/evidence-note/<encoded-id>`
- SOC 2 evidence: `#files/soc2-evidence/<encoded-id>`
- SOC 2 policy: `#files/soc2-policy/<encoded-id>`
- Task and supported generic records: `#item/<collection>/<encoded-id>`

An explicit approval may remain the winning `sourceKind`/`sourceId` while its `href` opens the exact linked authoritative Post, Campaign, Task, or supported record. Unsafe or unsupported links exclude the candidate.

## Founder-facing copy

Titles and summaries use source truth after visibility filtering, then normalize known legacy/technical terms through the shared founder-language contract. Email addresses are redacted from copied text. Normal visible copy does not expose collection names, raw status enums, capability IDs, or implementation vocabulary.

`sourceKind`, `workKind`, and `dedupeKey` remain machine fields and are not intended as visible labels.

## Action-intent limitations

Only `open`, `approve`, `complete`, and `snooze` can appear.

- `approve` is emitted only for an existing reviewed approval/suggestion operation.
- `complete` and `snooze` are emitted only for current Task/decision operations that already support them.
- Sources requiring more context emit only `open`.

There is no `send`, `publish`, `launch`, `delete`, `release`, `resume`, `apply`, provider, or other external action intent. CCX-200 supplies no executor.

## Side-effect guarantees

The projection modules:

- perform pure in-memory computation;
- do not mutate input arrays or records;
- do not read `process.env`;
- do not read browser globals;
- do not call `Date.now()` or construct an unsupplied current date;
- do not import storage, database, network, provider, sending, publishing, Campaign Command, or business-engine modules;
- do not fetch, persist, audit, send, publish, approve, complete, snooze, release, or update anything;
- return recursively frozen plain data.

## Performance

The focused deterministic production-like fixture contains 185 candidate source records across the reviewed collections.

Reference local run:

- candidate records scanned: 185
- normalized candidates before dedupe: 178
- duplicates removed: 7
- visible groups: Needs me 98, Waiting 67, Updates 6 (171 total)
- projection time: 40.575 ms
- serialized projection: 97,140 bytes
- input-state mutations: 0
- network requests: 0
- storage writes: 0

This is a local in-memory measurement, not a hosted-performance claim. The focused gate requires less than 100 ms and less than 250 KB for this fixture.

## Rollback

Rollback removes:

- `scripts/ui/view-models/inbox-view.mjs`
- `scripts/ui/view-models/inbox-sources.mjs`
- `scripts/test-vnext-inbox-projection.mjs`
- this document
- the `test:vnext-inbox-projection` package script

No state rollback, migration rollback, data repair, route rollback, or provider action is required because CCX-200 writes no data and changes no runtime page.

## CCX-201 handoff

After review and merge, CCX-201 may consume only the frozen normalized view and the exact three groups. It must not reinterpret source state, bypass authorization, replace source engines, change the current shell Inbox destination prematurely, or introduce persistence merely to render the page.

CCX-201 remains blocked until CCX-200 is reviewed and merged.

## CCX-202 action-adapter handoff

CCX-202 owns execution adapters. It must map declarative intents back to existing reviewed source operations, reauthorize every request on the server, re-read current source state, and preserve each engine's validation, audit, duplicate-protection, and live-action gates.

CCX-200 performs none of those actions.
