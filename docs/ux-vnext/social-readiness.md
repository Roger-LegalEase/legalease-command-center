# CCX-305 Social readiness projection

## Scope and contract

`buildPostReadiness(state, actor, postId, now)` is a pure, authorization-aware adapter. It translates stored Post safety, creative, channel, schedule, approval, and publishing truth into compact founder-facing readiness. It does not render Social UI, expose an endpoint, read environment configuration, or edit, regenerate, approve, schedule, send, or publish a Post.

The deeply immutable result contains `postId`, `generatedAt`, explicit `available`/`availability` truth, `state`, `headline`, `summary`, `nextStep`, `counts`, `checks`, `sourceAvailability`, and compact performance diagnostics. `generatedAt` is derived only from the supplied `now`; an invalid or missing value stays unavailable. A next step is explanatory navigation metadata, never an executable mutation intent.

## Source matrix

| Source | Truth used | Boundary |
| --- | --- | --- |
| CCX-300 `PostView` | Normalized Post identity, exact route, variants, schedule, creative references, and stored results | Preferred normalized source; never treated as authorization |
| `posts` | Content, explicit guideline results, selected channels, current status, schedule fields, approval fields, and per-channel publication fields | No state movement is inferred |
| `postImages` | Explicit generation state, final-image readiness, render QA, and style/brand gate | An asset ID alone never passes creative |
| `brandAssets`, `postingKits` | Explicit Post relationships available to PostView | No title or fuzzy matching |
| `socialAccounts` | Exact per-channel durable connection state | A record does not imply connection or publication enablement |
| `runtime.livePostingGates` | Read-only normalized channel booleans from stored booleans or `{ enabled }` records | No environment variables are read and no gate is changed |
| `approvals`, `approvalQueue`, `queueItems` | Explicit typed Post approval state | Approval does not imply publication |
| `publishEvents` and stored Post channel results | Explicit scheduled, failed, partial, or published result truth | No provider is called |

Raw provider payloads, tokens, audit bodies, activity-text inference, environment values, and live analytics requests are excluded. Activity or audit text and timestamps cannot establish a connection, approval, schedule, or publication fact.

## State vocabulary

The small founder-facing vocabulary is: **Ready to schedule**, **Ready for review**, **Ready to publish**, **Needs fixes**, **Needs connection**, **Needs schedule**, **Needs approval**, **Publishing is off**, **Published**, and **Unavailable**.

These are derived states, not workflow transitions. `Published` requires explicit stored publication truth for every selected channel. `Unavailable` is used when an authorized answer cannot be supported; missing data is not silently converted to false, zero, passed, or ready.

## Check categories and statuses

Every check belongs to exactly one of six categories: Content, Creative, Channels, Schedule, Approval, or Publishing. Presentation statuses are Passed, Needs attention, Blocked, and Unavailable. Checks expose founder labels and explanations, not technical rule IDs.

| Category | Passed truth | Blocking or attention truth | Unavailable truth |
| --- | --- | --- | --- |
| Content | Content is present and an explicit stored guideline gate passed | Missing content, any hard guideline failure, prohibited outcome promises, missing required disclaimers, unsupported personalization, or explicit review requirements | Stored guideline results are missing |
| Creative | Creative is explicitly omitted, or a final image has explicit render and style/brand passes | Missing required creative, generation failure, render failure, or brand-treatment failure | An asset exists without sufficient final QA truth |
| Channels | Each selected channel is explicitly connected and its controlled publishing gate is on | Not connected, refresh/error attention, or connected with publishing off | Connection or gate truth is absent |
| Schedule | A valid explicit schedule is selected, or no schedule is needed for the current step | Missing required schedule, invalid value, or explicit conflict | Schedule source truth cannot be resolved |
| Approval | Approval is explicitly not required or is explicitly approved | Ready for review, awaiting approval, changes requested, or blocked by hard failures | Approval truth is missing |
| Publishing | Controlled publication is available, or every selected channel has explicit published truth | Publishing off, scheduled-not-published, failed, or a partial channel result | Gate truth, per-channel publication truth, or published analytics are missing |

## Hard failures

Existing hard content failures stay blocking and carry an explicit `hardFailure` marker. The adapter groups technical rules into safe founder-facing checks and never returns their raw IDs. Prohibited outcome promises and required-disclaimer failures remain distinct, blocking explanations. Missing content is blocking without being relabeled as an authoritative hard-rule result. Explicit creative generation, render-QA, and brand/style failures are hard. Approval is reported as blocked until those stored hard content or creative failures are resolved; the adapter does not downgrade them to warnings.

## Channel readiness

Every selected channel is evaluated independently. Exact platform identifiers are normalized only for reviewed aliases such as Twitter/X. A ready LinkedIn channel cannot make an unconnected X channel ready. Connection requires durable stored connection truth, not merely the existence of an account row. Each channel check then distinguishes Ready, Connected but publishing off, Needs attention, and Status unavailable using a separate explicit boolean or the repository's actual `{ enabled }` gate shape. The Publishing category preserves the aggregate gate/result truth without treating connection as publication authority.

## Schedule, approval, and publishing separation

Schedule selection never implies publication. Before approval, the schedule check says no schedule is needed for the current step. Once approved, an absent optional schedule yields Ready to schedule; an explicitly required but absent schedule yields Needs schedule; invalid or conflicting data yields Needs fixes.

Approval not required, approval required, awaiting approval, approved, and blocked-by-hard-failures remain separate. Approved means only approved. Publishing off, explicit manual availability, controlled readiness, scheduled-not-published, full publication, partial channel results, and unavailable status also remain separate. The adapter cannot turn on a browser, process, or environment publishing gate.

## Next-step logic

The adapter returns one descriptive next step after applying deterministic priority:

1. Open published result when all selected channels have explicit published truth.
2. Review partial or failed channel results without republishing successful channels.
3. Fix content or add creative for blocking failures.
4. Connect the first blocked selected channel.
5. Choose a schedule for missing required or invalid schedule truth.
6. Review the Post or request approval through the existing approval workflow.
7. Schedule the Post when approved and otherwise ready.
8. Publish manually only when manual publication is explicitly available and controlled publishing is off.
9. Review the Post when controlled publication is ready or remains off.

These labels do not contain an executable action, automatic Le-E request, provider call, or mutation instruction. Post work uses the reviewed `#social/post/<id>` route, connection and publishing review uses `#settings`, and an outstanding approval request uses the existing `#queue` destination. No route is invented.

## Authorization and privacy

Actor authentication, known roles, `read_internal`, and the repository's record-visibility rules are applied before lookup and projection. A missing or unknown actor fails closed. A hidden Post returns the same unavailable presentation as an absent Post and leaks no title, body, checks, counts, account metadata, or source detail. Related records are filtered before they can affect output.

Output excludes full provider payloads, credentials, access and refresh tokens, environment values, private asset paths, signed URLs, idempotency keys, raw audits, sensitive notes, and technical rule IDs. Only compact collection/source IDs needed by a future authorized consumer and the existing exact `#social/post/<id>` route are retained.

## Determinism, performance, and rollback

The supplied `now` is the only clock. Stable ID/time ordering makes approval, image, account, and channel selection independent of input order. Results are recursively frozen, and projection performs no network request, storage write, state mutation, approval, schedule, send, publication, provider call, or external action.

The focused benchmark projects 100 detailed Posts. A representative run scanned 20,100 source candidates across the 100 singular projections, produced 700 checks, and completed in approximately 159 ms with a 283,701-byte serialized result. It recorded zero blocking or unavailable checks in the all-ready benchmark fixture and zero network requests, storage writes, source mutations, approvals, schedules, sends, publications, provider calls, or external actions. This is an adapter benchmark, not an unpaginated endpoint proposal.

Rollback is deletion of the two pure modules, focused test, documentation, and additive package script. There is no storage rollback, migration, endpoint, UI, or runtime state to reverse.

## CCX-301 / CCX-302 handoff

CCX-301 and CCX-302 may consume this adapter after independently applying their reviewed Social UI and composer boundaries. Consumers should render the returned state, checks, counts, source availability, and descriptive next step without recomputing readiness or treating visibility as authorization. Mutating approval, scheduling, connection, or publication controls remain separate reviewed work owned by their runtime packets. CCX-305 does not implement or authorize those controls.
