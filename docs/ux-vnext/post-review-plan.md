# Post review plan

CCX-307A defines a pure read-model for reviewing one exact Social Post. It does not add a review page, endpoint, controller, stylesheet, approval write, feedback write, edit, image generation, schedule write, publication, provider call, network request, or storage write.

## Contract

`buildPostReviewPlan(state, actor, postId, now)` returns a deeply immutable projection with:

- canonical `postId`, exact Post `href`, and caller-supplied `generatedAt`;
- one of `not_ready_for_review`, `ready_for_review`, `awaiting_review`, `changes_requested`, `approved`, or `unavailable`;
- explicit approval evidence, blocking content/creative checks, current requested changes, stable version references, regeneration truth, meaningful review activity, read-only guidance, source references, and availability;
- mutation/execution capabilities fixed to `false`, while read-only approval eligibility may be presented separately.

Missing or unknown actors, hidden Posts, unavailable authorization sources, and invalid clocks encountered before authorization fail closed without echoing the caller-supplied ID. Their result has `postId: null`, `href: null`, no source references or approval/version/feedback/activity/regeneration detail, and `availability.counts: null`. Filtering happens before identity, state, counts, version selection, or activity output. Hidden feedback, versions, images, and events disclose nothing and cannot affect the projection.

## Source authority

| Source | Authority |
| --- | --- |
| CCX-300 PostView | Canonical Post identity, exact link, normalized assets, versions, and evidence references |
| CCX-302A ComposerDraftView | Authorized draft, exact shared/variant facts, creative availability, and non-executable guidance |
| CCX-305 Social readiness | Plain-language content, creative, render, style, and required-brand checks |
| CCX-306A Social schedule plan | Read-only schedule/publication separation; it never establishes review state |
| Post and related approvals | Explicit Post approval or stable/current/versioned approval records |
| Explicit feedback records | Current requested changes with exact Post relationships and lifecycle truth |
| Post/copy/image version records | Exact stable version references only |
| Generation batches and Post images | Generation lifecycle only; completion is not image approval |
| Explicit activity/audit events | Meaningful related review history for display only; prose never establishes state |

Post approval fields are the current stored Post truth when present. Otherwise, one related approval is accepted, an explicit single current record is accepted, or one version lineage resolves to its unique highest version. Multiple unresolved current records fail closed as ambiguous.

Current feedback must have an explicit stable ID, exact Post relationship, safe summary, and active/current lifecycle. Resolved, superseded, dismissed, closed, inactive, archived, and cancelled feedback is historical and cannot remain a current requested change. Unknown lifecycle truth remains unavailable instead of being declared current.

## Review states and hard gates

Content and creative readiness checks remain authoritative. Missing required review material is not ready. Guideline hard failures, failed generation, render QA, style, and required-brand failures remain blocking and keep approval unavailable. Every projected block uses the existing founder-facing explanation; raw technical rule IDs and raw failure payloads are not returned.

State precedence is:

1. ambiguous approval truth is `unavailable`;
2. current blocking content or creative truth is `not_ready_for_review`;
3. explicit current requested changes are `changes_requested`;
4. explicit pending review is `awaiting_review`;
5. explicit approval is `approved`;
6. otherwise the stored draft is `ready_for_review`.

Schedule, publication, and free-form activity prose never establish review state. Approval is review truth only: it cannot schedule, publish, launch, regenerate, or execute another action. Current requested changes are not erased by historical approval evidence.

## Read-only approval eligibility

The existing Post approval operation is `POST /api/approval/:id/approve`. Repository endpoint policy requires its existing `manage_approval_queue` capability: owner and admin have it, while operator and viewer do not. This projection calls the same `requiredCapabilitiesForEndpoint(...)` and `canPerformEndpoint(...)` policy; it does not invent a capability or change a role.

`approveAction` contains `available`, `executable: false`, `reason`, and `requiredCapability`. Presentation availability is true only for a capable actor when approval truth is unambiguous and available, the Post is ready or awaiting review, no Content/Creative block or current requested change remains, and the Post is not already approved. False reasons are `actor_cannot_approve`, `blocked_by_review_check`, `changes_requested`, `ambiguous_approval_truth`, `already_approved`, or `approval_source_unavailable`. An unavailable Post returns no approval detail at all. Any eventual write endpoint must independently reauthorize.

## Versions, activity, and regeneration

The current Post is referenced directly. Previous Post/copy versions and image versions require explicit stable IDs and exact Post relationships. No fuzzy title, timestamp-only, filename, or copy matching is used.

Activity includes only explicitly related review, approval, requested-change, and image-generation event types. Raw email bodies, sensitive notes, provider payloads, legal records, PII, and raw audit bodies are excluded.

Regeneration is one of `available`, `blocked_by_hard_failure`, `in_progress`, `failed`, `complete`, or `unavailable`. It returns no operation or executable intent. A generated image is not treated as approved unless separate explicit image-approval truth exists.

## Privacy and side effects

The projection never returns credentials, tokens, signed URLs, environment values, local/private paths, provider payloads, raw audits, raw rule IDs, or raw image data. Network, provider, storage, source, Post, approval, feedback, generation, scheduling, and publication mutations remain zero.

## Performance fixture

The focused test projects 100 detailed Posts with two image versions each, Post/copy histories, explicit feedback, activity, approval states, and hard creative failures. It reports candidates examined, Posts projected, blocking checks, feedback records, versions, activity events, wall-clock projection time, serialized aggregate size, and zero mutation/action counts. This is an adapter benchmark, not an endpoint payload proposal.

The correction benchmark scanned 42,920 authorized candidates and projected 100 Posts, 10 blocking checks, 20 current feedback records, 500 version references, and 220 activity entries in 11,734.940 ms. The aggregate serialized result was 474,780 bytes. Approval writes, requested-change writes, Post edits, image generations, schedule writes, publications, provider calls, network requests, storage writes, source mutations, and action intents were all zero. Timing is diagnostic and varies by host load.
