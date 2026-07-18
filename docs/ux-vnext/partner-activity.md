# CCX-503 Partner activity projection

## Projection contract

`buildPartnerActivity(state, actor, partnerId, now)` is a pure read adapter for one exact Partner. It returns a recursively frozen object with the Partner ID, caller-supplied generation time, availability, authorized events, represented filters, and projection diagnostics. It does not copy activity into a new collection or expose source records.

Availability is explicit:

- `available_with_events` means authorized source data produced events.
- `available_empty` means the Partner is readable but no authorized event is represented.
- `unavailable` with `actor_cannot_read`, `source_data_absent`, or `partner_not_visible` means counts and filters are withheld rather than reported as zero.

Each event has stable projection identity and deduplication keys, a founder-facing type/label/summary, the stored occurrence time or `null`, a minimally necessary actor label, source identity and safe link, explicit related objects, optional stage-change detail, and visibility/redaction metadata. Raw input records are never returned.

## Actual source matrix

| Source | Included truth |
| --- | --- |
| `partners.history` | Structured stage changes and notes on the exact Partner |
| `activityEvents` | Typed, explicitly related relationship events |
| `auditHistory` | Typed, explicitly related events and reliable mirrors |
| `automationEvents` | Read-only reply/meeting signals with a typed Partner or authoritative Campaign relationship |
| `companyEvents` | Typed company-memory events with an explicit Partner relationship |
| `tasks` | Explicitly related completed tasks only |
| `outreachAttempts` | Sent attempts whose Campaign explicitly identifies the Partner |
| `outreachReplies` | Replies whose Campaign explicitly identifies the Partner |
| `campaigns.distributionActions` | Sent/shared/distributed/published actions on canonical Partner-linked Campaigns |
| `reports` | Explicitly Partner-related generated reports |
| `partnerProgramArtifacts` | Artifacts connected through an explicitly Partner-linked Program |
| `evidencePackNotes` | Explicitly Partner-related notes |
| `dataRoomItems` | Explicitly Partner-related records with stored sharing truth |

The source arrays stay separate and authoritative. The adapter constructs relationship indexes; it never merges or rewrites them.

## Relationship rules

Membership requires a stable `partnerId`/`partner_id`, a typed Partner source reference or related object, an explicit Campaign-to-Partner relationship, an explicit Program-to-Partner relationship, or a reference to an artifact/task/file that itself has one of those relationships. A Campaign ID is resolved only against readable canonical `campaigns` or `outreachCampaigns`; a Program ID is resolved only against readable `partnerPrograms`.

Names, titles, free text, email domains, owners, timing, and vague notes are never relationship evidence. Unlinked records that merely mention the organization are excluded. Canonical `campaigns` and legacy `outreachCampaigns` are indexed separately; source-family context selects the authoritative relationship, and an ambiguous same-ID collision fails closed.

## Event vocabulary and presentation

The compact visible vocabulary is Reply, Meeting, Note, Stage change, Outreach, Document, File, and Task. Filters are All, Replies, Meetings, Notes, Stage changes, Outreach, Documents/files, and Tasks, but only categories represented by authorized events are returned. Filter counts are derived after authorization and deduplication.

Events sort by stored `occurredAt` descending, then founder-facing label, then stable projected ID. Invalid or absent timestamps remain `null` and sort last. Source-specific timestamp rules prevent task creation time from masquerading as completion time or file creation time from masquerading as share time. The adapter does not invent timestamps. Multiple meetings or changes at the same time remain distinct. `filterPartnerActivity` applies only a represented authorized filter and returns a new frozen result without changing the projection.

## Deduplication

Explicit identities are considered in this order: shared event identity, a structured source reference to the authoritative record, a safe explicit provider/idempotency identity, and source collection plus source ID. Every cross-record identity is scoped to the founder-facing event type, so an outreach send and reply cannot collapse when an upstream ID is reused. Source precedence favors the domain record over automation, company-memory, activity, and audit mirrors. An audit record collapses into a domain/activity event only when one of those reliable keys connects them. Summary text and timestamps are never deduplication keys, and input order cannot select a different winner.

## Stage changes

Structured from/to values pass independently through the merged CCX-500 Partner-stage adapter. Safely mapped commercial values use New, Qualified, In conversation, Proposal, Active, or Closed. Closed outcome detail such as Lost, Inactive, or Archived remains separate. Stalled, paused, and dormant can produce Needs attention without fabricating a commercial destination. Unknown or operational values have no founder-facing stage. The current Partner stage, notes, activity, proposals, pilots, and Programs are not used to infer a transition, and the adapter never changes a Partner stage.

## Authorization and sensitive content

The actor must be authenticated, use a known repository role, and have `read_internal`; unknown or missing actors fail closed. Existing record visibility rules filter Partners, sources, Campaigns, Programs, nested history, and distribution actions before projection and before diagnostics. Hidden records do not affect counts or filters.

Summaries are generated from event type and narrowly safe titles. Full email/reply bodies, provider payloads or names, headers, tokens, secrets, raw audit bodies, legal/case details, notes, private paths, signed URLs, and meeting descriptions are never projected. Actors without `read_sensitive` receive a generic meeting summary and explicit redaction metadata. Visibility is not an access grant.

## Exact links

Reviewed routes are preserved when source identity supports them:

- Partner: `#partners/partner/<id>`
- Campaign: `#outreach/campaign/<id>`
- Task: `#item/tasks/<id>`
- File/report: `#files/<source-kind>/<id>`
- Post: `#social/post/<id>`

Program and Program-artifact activity uses the safest current generic item destination. Legacy `outreachCampaigns` do not masquerade as canonical Campaign records, so their activity has no canonical Campaign link. Related-object links are emitted only when the related record is readable. A missing, unsafe, or unsupported source identity produces `null`; an unsafe event identity omits the event entirely. CCX-503 does not invent routes.

## Deferred sources

`meetingBriefs`, `googleInsights`, `conversationNotes`, and `calendarItems` lack typed Partner-ID parity in their current stored shapes. `rcapRevenueEvents` uses RCAP account/contact identity rather than canonical Partner identity. Raw `events`, `outreachSendClaims`, `reactivationEvents`, `inboxSignals`, and `supportIssues` are operational, differently scoped, or sensitive. They remain deferred even when text happens to mention a Partner.

## Performance and side effects

A production-like adapter benchmark with 100 Partners and 1,020 physical candidate records (1,000 authorized plus 20 restricted) scanned 1,000 authorized candidates. For the requested Partner it classified 10 events, removed one explicit audit mirror, and projected nine events in a representative 14.228 ms run; the serialized projection was 6,127 bytes. Network requests, storage writes, source mutations, and Partner-stage changes were all zero. This is an adapter benchmark, not an unpaginated endpoint proposal.

## Rollback and handoff

Rollback is removal of the package script, two pure modules, focused test, and this document; no data rollback is required. CCX-501 and CCX-502 may consume this projection after review and merge, but must preserve exact-Partner authorization, availability states, safe summaries, and represented-only filters. Endpoint, UI, browser-controller, storage, migration, and workflow integration remain deferred.
