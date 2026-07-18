# CCX-309A Social Results intelligence

CCX-309A defines a pure, authorization-aware read model for published Social results. It does not modify the current Social Results UI and adds no endpoint, browser controller, provider integration, refresh job, or mutation.

## Contract

`buildSocialResultsView(state, actor, now, query)` returns a deeply immutable projection:

```js
{
  generatedAt,
  items,
  summaries,
  filters,
  activeFilters,
  pagination,
  sourceAvailability,
  capabilities
}
```

Each item preserves the canonical Post identity and exact link from PostView. Publication evidence remains per channel. Topic, campaign, template, theme, performance, reuse eligibility, proof relationships, and safe source references are compact projections of stored truth.

Unavailable authorization returns no items, no summaries, no source counts, and no caller-supplied object identity. All capability flags remain false.

## Source matrix

| Source | Truth consumed |
| --- | --- |
| CCX-300 PostView | Canonical Post identity, exact links, reusable shared content, and exact proof/File relationships |
| CCX-303A Social creative catalog | Authorized exact template identity and category truth |
| CCX-305 Social readiness | Reviewed read-only content, creative, and source availability |
| CCX-308A publishing controls | Current-revision publication precedence and validated published URLs |
| `publishEvents` | Explicit per-channel successful publication results |
| `publishClaims` | Current approval-revision durable publication outcomes |
| `posts.publishAttempts` | Stable legacy per-channel publication outcomes |
| `posts.performance` | Explicit stored performance fields and the stored snapshot time |
| `campaigns` | Exact Campaign relationships |
| `reports`, `dataRoomItems`, `evidencePackNotes` | Exact PostView proof and File relationships |
| Existing Create Post policy | Read-only reuse eligibility through `manage_content_drafts` |

Source records are filtered for the actor before projection, counts, filters, summaries, or comparisons. Hidden Posts, events, claims, attempts, campaigns, templates, metrics, Files, and proof records disclose nothing and affect no count.

The adapter clones each visible record before passing it to a downstream projection. Nested publication attempts are visibility-filtered and then cloned. Settings source items and local assets, Post performance, Campaign facts, and exact proof relationships are likewise adapter-owned. The source result contains compact facts rather than the complete authorized state or raw evidence records. Deep-freezing the source and public output therefore never freezes a caller-owned root, array, record, nested object, property descriptor, or function.

## Publication truth

A result requires exact successful publication evidence. The projection accepts a current-revision successful `publishEvent`, a current durable published claim, or a stable explicit successful legacy attempt resolved through CCX-308A. A Post status, URL, or analytics object alone never establishes publication.

Evidence resolution evaluates all visible candidates matching collection, source ID, exact Post relationship, normalized channel, current approval revision, lifecycle, and stable lineage/version truth. It does not use array-order or first-match lookup. Exact physical mirrors collapse only when the relevant Post, channel, revision, lifecycle, lineage/version, publication time, and result URL truth are equivalent. Conflicting mirrors fail closed.

Current-revision evidence is preferred and explicit mismatches are historical. An unrevisioned stable legacy attempt may establish a result only when CCX-308A selected it as current and no visible revisioned competitor exists for that Post and channel. Duplicate IDs across Posts, channels, or revisions cannot cross-resolve. Hidden nested attempts are removed before resolution and affect neither result truth, ambiguity, exclusions, nor candidate counts.

Partial publication creates one result for each explicitly successful channel. Failed, publishing, terminal, reconciliation-required, and ambiguous channels are excluded. Exact current approval-revision truth is preserved. A published URL is returned only after explicit success and only when CCX-308A has validated it as an ordinary HTTP or HTTPS result URL; a URL never establishes success by itself.

Results sort by reviewed channel order—LinkedIn, Instagram, Facebook, X, and Threads—then safe unknown-channel label, descending publication time, and canonical Post identity.

## Metrics

The adapter projects only explicit non-negative stored values for impressions, reach, likes, reactions, comments, shares, reposts, clicks, saves, and video views. Missing values are `null` and unavailable, never inferred as zero.

An explicit stored engagement rate is preserved. A rate may otherwise be derived only when both the reviewed stored engagement numerator and impressions denominator are present and the denominator is greater than zero. Missing components do not become zeros, and no denominator is invented.

The current repository stores Post-wide performance rather than per-channel snapshots. Those metrics are therefore projected only when a Post has exactly one successful channel result. They are unavailable for a multi-channel success rather than copied, combined, or presented as comparable channel data. Ranked summaries remain unavailable because the adapter cannot guarantee a complete, definition-compatible comparison set. It makes no causal or “best Post” claim.

## Exact topic, campaign, template, theme, and proof truth

Topic and theme use only exact stored fields. Unknown safe stored values receive sanitized founder-facing labels. Prose, hashtags, image names, and visual appearance never establish a theme.

Campaigns use exact visible Campaign IDs and canonical links. Templates use exact IDs resolved through the authorized Social creative catalog; a missing or unauthorized template remains unavailable and is never substituted. Proof uses exact PostView relationships to `reports`, `dataRoomItems`, or `evidencePackNotes`. A performance result is not automatically investor proof.

The repository has no reviewed mark-as-proof operation for this projection. `markAsProof` is therefore unavailable and non-executable; the adapter invents neither a capability nor an endpoint.

## Reuse eligibility

Reuse is informational only:

```js
{
  available,
  executable: false,
  reason,
  requiredCapability: "manage_content_drafts"
}
```

Availability requires the existing Create Post policy, exact successful publication evidence, a visible canonical Post, reusable shared content, and unambiguous source truth. The projection never creates or duplicates a Post. It returns no future-draft payload and never copies analytics, publication status, attempts, approvals, or published URLs into a draft.

## Filters and pagination

Filters are computed only from authorized projected results. Supported active filters are channel, topic, campaign, template, theme, metric availability, proof relationship, and reuse availability.

Pagination defaults to 24 and caps at 40. The deterministic cursor masks its position inside an opaque token, validates an integrity checksum, and binds to both the active filter set and the reviewed result-ordering contract version. It contains no readable decimal or base-36 offset and no source identity. An invalid, tampered, cross-filter, or different-ordering-version cursor safely restarts at the first authorized result and is reported invalid. A caller may change the page limit without invalidating the established position, and stable paging produces no duplicate items.

## Privacy and side effects

The projection never returns credentials, tokens, provider payloads, raw analytics bodies, signed URLs, private paths, raw audits, PII, or technical rule IDs. Safe source references contain only reviewed collection, identity, relationship, and canonical-link truth.

All network requests, provider calls, analytics refreshes, Post duplications, reuse writes, proof/File writes, publications, retries, approvals, schedules, storage writes, and source/Post/File mutations remain zero. Inputs are not frozen, normalized, reordered, replaced, or mutated; their JSON, descriptors, extensibility, references, and exact order remain unchanged. Output remains deeply immutable, deterministic, and input-order independent.

## Production-like benchmark

The focused test builds 100 detailed Posts across five selected channels with successful, partial, failed, pending, terminal, and reconciliation-required outcomes, mixed metric availability, exact themes/templates, proof links, and restricted records. It reports candidates examined, published results, exclusions by lifecycle, metric values, unavailable metrics, reusable results, proof-linked results, projection time, serialized size, and every action/mutation count. This is an adapter benchmark, not an endpoint payload or UI proposal.

On the correction verification run, the authorized projection examined 573 visible candidates and produced 90 published channel results. It projected 120 metric values, kept 870 metric fields unavailable, found 90 reusable results and 20 proof-linked results, serialized to 102,910 bytes, and completed in approximately 3.06 seconds. All action and mutation counts were zero. Timing is environment-dependent.
