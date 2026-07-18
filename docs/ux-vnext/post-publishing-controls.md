# Post publishing controls

CCX-308A defines a pure read model for connection and publication controls for one exact, authorized Post. It does not add a page, endpoint, browser controller, credential read, gate change, publication, retry, schedule write, approval, provider call, or storage write.

## Contract

`buildPostPublishingControls(state, actor, postId, now)` returns deeply immutable truth shaped as:

```text
{
  postId, href, generatedAt, state, channels,
  manualFallback, approval, schedule, review,
  publicationSummary, guidance, sourceReferences,
  availability, performance, capabilities
}
```

PostView remains the canonical identity and exact-link authority. ComposerDraftView, channel variants, Social readiness, the schedule plan, and the review plan remain authoritative for their respective read-only facts. The result never returns an executable operation; every capability is false.

Authorization failures are identityless: `postId` and `href` are null, source references and channels are empty, counts are null, and no account, gate, attempt, result, review, schedule, approval, or fallback detail is disclosed.

## Source matrix

| Source | Projected truth |
| --- | --- |
| CCX-300 PostView | Canonical authorized Post identity and exact link |
| CCX-302A ComposerDraftView | Read-only draft, creative, approval, and readiness context |
| CCX-304A Post channel variants | Explicit selected channels and independent stored variants |
| CCX-305 Social readiness | Stored blocking checks, connection checks, gates, and result truth |
| CCX-306A Social schedule plan | Exact shared and per-channel schedule truth |
| CCX-307A Post review plan | Explicit review approval and current blocking truth |
| `socialAccounts` | Visible durable per-channel connection records |
| `runtime.livePostingGates` | Read-only server-side gate state |
| Post result maps and `publishEvents` | Explicit per-channel outcomes and published URLs |
| Post attempts and `publishClaims` | Explicit stable attempt/claim lifecycle truth |
| `manualPublishingAvailable` | Explicit manual-fallback availability only |
| Existing controlled publishing policy | Shared `social_publish` requirement for the reviewed controlled routes |

`POST /api/linkedin/publish` and `POST /api/publishing/run` both resolve through `requiredCapabilitiesForEndpoint(...)` and `canPerformEndpoint(...)` to the existing `social_publish` capability. The projection requires those policy sources to agree and fails closed with `publication_policy_unavailable` if they do not. The current role policy gives `social_publish` to owner only; admin, operator, and viewer are not broadened. The public projection returns capability eligibility, not an endpoint operation or promise. Every future write endpoint must independently reauthorize and revalidate the operation.

## State truth

Overall states are Needs connection, Connected/publishing off, Needs attention, Ready to publish, Partially published, Published, Manual publishing available, and Unavailable.

Each selected channel independently distinguishes not connected, connected with publishing off, needs attention, ready, scheduled, publishing, published, failed, and unavailable. A social-account record alone does not establish a durable connection. Connection never enables the server gate, and an enabled gate never establishes review, readiness, schedule, publication, or actor authority.

Read-only channel eligibility is available only when the actor has the existing capability, the channel is selected and durably connected, the server gate is true, required review is approved, Content and Creative readiness are not blocking, the schedule permits the contemplated step, no stored success exists, and no unresolved or ambiguous attempt blocks another attempt. `executable` remains false. No idempotency key is created.

A shared schedule is not copied into channel records. Selected channels and stored variants remain independent. Approved does not mean scheduled or published, scheduled does not mean published, and one ready channel does not make all selected channels ready.

## Approval revision, attempts, and result precedence

The current publication revision follows the publishing service: explicit `approvalRevision`, otherwise `approvedAt`/`approved_at`, otherwise the reviewed `approval-1` service fallback only for approved/publishable truth. Durable claims are resolved by exact Post ID, channel, and revision. Explicitly mismatched revisions are historical and cannot block, publish, or authorize retry. An unavailable current revision with unresolved revisioned claims fails closed. Hidden claims affect neither resolution nor counts.

Two physical mirrors may collapse only when stable ID, channel, revision, and lifecycle agree. Conflicting mirrors or multiple unresolved matching claims are ambiguous. Repeated legacy attempts resolve only through an explicit current marker or one stable lineage/identity with unique versions. Timestamps and provider text never choose the winner.

Publication authority uses this precedence:

1. explicit stored success for the current approval revision;
2. the current durable claim for that revision;
3. one stable current legacy attempt;
4. explicit per-channel Post status;
5. global Post status for a single selected channel only.

Current success prevents retry. A current `publishing` or `publish_claimed` claim overrides stale failed, scheduled, or ready fallbacks. A current published claim overrides a stale failed attempt. Current success conflicting with reconciliation truth is surfaced as needs attention and is never retryable. Global published status never fabricates per-channel success for a multi-channel Post.

Lifecycle truth remains distinct: `publish_claimed` and `publishing` are in progress; `published` is successful; `failed_retryable` and legacy `retry_ready` may be informationally retryable after every other gate passes; `failed_terminal` is never retryable; `reconciliation_required` needs attention and is never retryable; plain stable legacy failure may be retryable; and `error`/`blocked` remain non-retryable unless separate explicit retryability truth exists. Founder-facing channel states remain within the reviewed channel vocabulary.

Explicit stored success is required for Published; global status is accepted only for the reviewed single-channel legacy fallback. A URL alone cannot establish success. Published URLs must be stored HTTP/HTTPS result URLs; signed/tokenized URLs, API URLs, credential-bearing URLs, and provider dashboards are suppressed. Missing URLs remain unavailable without changing the stored publication result.

Successful channels are never retry eligible. A partial result preserves successes while independently reporting stable failed channels as read-only retry eligible when every other requirement still passes. Retry eligibility is non-executable.

Manual fallback is available only when explicitly stored. Missing truth is status unavailable, explicit false is unavailable, and stored success makes fallback not needed. Manual fallback never changes the Post or channel to Published.

## Privacy and side effects

Filtering occurs before output and counts. Hidden Posts disclose no identity. Hidden accounts, events, claims, and attempts affect neither state nor counts. Account identifiers appear only as compact safe source references when needed. Credentials, access or refresh tokens, environment values, provider payloads, raw provider errors, private paths, signed URLs, raw audits, and technical rule IDs are not returned.

The projection performs zero connections, credential reads, gate changes, publications, retries, attempt creations, idempotency-key creations, schedule writes, approvals, provider calls, network requests, storage writes, or source/Post/variant mutations.

## Benchmark

The focused test projects 100 detailed Posts across five selected channels with connected accounts, enabled gates, successful, failed, and in-progress records, explicit manual fallback, and stable attempt truth.

Observed local adapter result:

```json
{"candidatesExamined":10520,"postsProjected":100,"channelControls":500,"connectedChannels":500,"gatedChannels":500,"eligibleChannels":480,"publishedChannels":10,"failedChannels":10,"ambiguousRecords":0,"projectionMs":5836.326,"serializedBytes":802315,"connections":0,"credentialReads":0,"gateChanges":0,"publications":0,"retries":0,"attemptCreations":0,"idempotencyKeyCreations":0,"scheduleWrites":0,"approvals":0,"providerCalls":0,"networkRequests":0,"storageWrites":0,"sourceMutations":0,"postMutations":0,"variantMutations":0}
```

This is an adapter benchmark, not an endpoint, provider, UI, or publishing proposal.

## Follow-on consumption

CCX-308B can consume the immutable overall and per-channel facts for presentation while keeping every operation outside this module. It must preserve identityless authorization failure, exact source references, independent channel truth, server-side gate authority, endpoint reauthorization, explicit-success requirements, and the zero-side-effect boundary.
