# Post view model

## Purpose

CCX-300 adds a read-only `PostView` projection for the Social workspace. It
normalizes existing Post records and their explicitly linked records without
changing storage, routes, provider behavior, publishing gates, or visible UI.

The projection is implemented in:

- `scripts/ui/view-models/post-view.mjs`
- `scripts/ui/view-models/post-sources.mjs`

It is not wired into `scripts/preview-server.mjs` and does not add an endpoint.
CCX-301 may consume the projection when it builds the Social home views.

## Public contract

```js
import {
  POST_STATUS_CONTRACT,
  adaptPostStatus,
  buildPostView,
  buildPostViews
} from "../../scripts/ui/view-models/post-view.mjs";
```

- `buildPostView(state, postOrId)` returns one deeply frozen `PostView`, or
  `null` when the Post cannot be resolved to a safe exact link.
- `buildPostViews(state)` returns a stable, deduplicated, deeply frozen list of
  views for `state.posts`.
- `adaptPostStatus(post)` returns one frozen founder-facing status.
- `POST_STATUS_CONTRACT` publishes the five allowed status values.

The same source state produces the same value. Source array ordering does not
change the projection, duplicate Post IDs collapse to the most recently updated
record, and source objects are never mutated.

## PostView shape

| Field | Meaning |
| --- | --- |
| `id` | Existing canonical Post ID. |
| `stableKey` | Stable `post:<id>` identity for consumers. |
| `objectType` | Always `Post`. |
| `title` | Founder-readable title with an `Untitled post` fallback. |
| `content` | Normalized body, hook, call to action, hashtags, audience, campaign, topic, and owner. |
| `status` | Founder-facing status key and label. |
| `sourceReferences` | Explicit normalized joins back to existing records. |
| `channelVariants` | Stable channel-specific copy and referenced asset IDs. |
| `assetReferences` | Existing Post image, brand asset, and posting-kit references. |
| `schedule` | Valid stored schedule, timezone, and channels. |
| `readinessSummary` | Founder-facing approval, blocker, and warning summary. |
| `resultSummary` | Sanitized publication state and aggregate metrics. |
| `activity` | Sanitized, reverse-chronological Post activity. |
| `createdAt`, `updatedAt` | Existing stored timestamps; the projection does not create timestamps. |
| `href` | Exact canonical Post deep link. |

## Stable identity and exact links

Every view starts from an existing canonical Post record: `buildPostViews`
projects only `state.posts`, while `buildPostView` accepts an existing Post
record or its ID. Neither builder converts records from another collection. A
view keeps the stored Post ID and resolves through the route compatibility
contract to:

```text
#social/post/<encoded-post-id>
```

The builder fails closed for an empty or unsafe identity. It does not invent an
ID from a title, array position, Content Bank idea, proof record, or calendar
row. The exact link remains compatible with the existing legacy
`#item/posts/<encoded-post-id>` recovery link.

## Founder-facing status

The projection exposes only the status language registered for Posts:

| Key | Label | Existing signals |
| --- | --- | --- |
| `idea` | Idea | Idea or ready-to-generate records without draft copy. |
| `draft` | Draft | Existing working records that have not reached another state. |
| `needs_review` | Needs review | Failed, blocked, review-required, changes-requested, or approval-required signals. |
| `scheduled` | Scheduled | Existing scheduled status or stored schedule. |
| `published` | Published | Existing published/manual-posted state, timestamp, URL, or successful per-channel state. |

Precedence is Published, Needs review, Scheduled, Idea, then Draft. Readiness is
kept separate from workflow status so a Draft can say what still needs work
without rewriting its stored state.

## Normalized source mappings

Joins are ID-based and additive. The projector does not use title matching,
copy matching, guessed dates, or other fuzzy relationships.

| Relationship | Existing source | Join signals | Projected kind/link |
| --- | --- | --- | --- |
| Canonical record | `posts` | `post.id` | `post`; exact Post link. |
| Idea | `contentBank` | `contentBankIdeaId`, `ideaId`, explicit source reference, or record Post ID | `content-bank`; generic existing item link. |
| Intake source | `settings.sourceItems` | `sourceItemId` or `queuedPostId` | `source-item`; no invented route. |
| Calendar import | Embedded import metadata on the Post | Calendar source type plus `importKey`/`calendarImportKey` | `calendar-import`; exact Post link. |
| Proof | `reports` | Explicit report ID/source reference or record Post ID | `report`; exact File link. |
| Proof | `dataRoomItems` | Explicit proof/data-room ID/source reference or record Post ID | `data-room-item`; exact File link. |
| Proof | `evidencePackNotes` | Explicit evidence-note ID/source reference or record Post ID | `evidence-note`; exact File link. |
| Repurposed source | `posts` | `repurposedFromPostId` | `post`; exact source Post link. |
| Generation | `generationBatches` | Batch `postIds` | `generation-batch`; generic existing item link. |
| Approval | `approvals`, `approvalQueue`, `queueItems` | Typed Post ID or exact `posts` source reference | `approval`; generic existing item link. |
| Assets | `postImages` | Post ID | Sanitized image reference. |
| Assets | `brandAssets` | Explicit Post/variant asset ID or slug | Sanitized brand-asset reference. |
| Assets | `postingKits` | Post ID | Sanitized posting-kit reference. |
| Results | `publishEvents` | Post ID or related Post ID | Sanitized per-channel publication result. |
| Activity | `activityEvents`, `auditHistory`, `publishEvents`, Post publish attempts, approvals | Explicit Post relationship | Sanitized activity entry. |

Each source reference contains only `sourceKind`, `sourceCollection`, `sourceId`,
`relationship`, and a safe existing link when one is defined. A relationship
does not copy, replace, or remove the underlying record.

## Channel, asset, schedule, readiness, and results rules

Channel names normalize known aliases such as `twitter` to `x`. Known channels
have a fixed order: LinkedIn, Instagram, Facebook, X, then Threads. Unknown safe
channel identifiers follow alphabetically. A channel variant inherits shared
Post copy only where its own stored copy is absent.

Assets are references, not embedded provider payloads. Their founder-facing
status is `Ready`, `Needs review`, or `Draft`, based only on stored QA/readiness
signals. All existing image versions remain represented; no image or asset is
changed.

Schedules are accepted only when the stored value has a valid ISO-style date or
date-time. The original timestamp and timezone strings are retained. The
projection never schedules a Post and never uses the current clock.

Readiness summarizes stored copy review, guidelines, compliance risk, latest
image QA, preview confirmation, channel selection, approval, connection state,
and an explicitly disabled runtime publishing gate. It does not run or replace
the authoritative guidelines, approval, or publishing engines. Raw rule details
are intentionally omitted.

Results include non-negative stored aggregate counts, a stored or derived
engagement rate, safe HTTPS publication URLs, and sanitized per-channel state.
Missing metrics remain `null`; they are not rendered as zero. Provider payloads,
provider IDs, error messages, actor identities, and credentials are not
projected.

Activity exposes a stable ID, category, founder-facing label, channel, stored
timestamp, and safe existing link. It does not expose raw audit details,
provider responses, approval notes, or personal data.

## Included and deferred fields

Included in CCX-300:

- stable canonical Post identity and exact deep link;
- founder-facing Post status;
- normalized content and channel variants;
- explicit idea, intake, calendar, proof, generation, and approval references;
- image, brand-asset, and posting-kit references;
- stored schedule and timezone;
- readiness, result, and activity summaries;
- existing created and updated timestamps.

Deferred to later packets or existing authoritative systems:

- converting an unlinked Content Bank idea, proof record, or calendar row into a
  Post;
- Social home grouping, filtering, empty states, cards, and other UI;
- composer fields, edits, autosave, asset generation, and preview UI;
- runtime endpoints, storage/model migrations, or route changes;
- approval, scheduling, sending, publishing, retry, or provider mutation;
- analytics collection, provider refresh, raw provider details, or new metrics;
- authorization policy changes and audit writes.

Unconverted Content Bank records remain source records. CCX-301 can show them in
Ideas using its existing authorized source input, while using `PostView` for any
record that has become a canonical Post.

## Authorization and safety boundary

The module is a projection, not an authorization layer. A future server or UI
consumer must pass only records the current actor is already allowed to read.
The projector cannot broaden access because it performs no state lookup beyond
the supplied object and has no storage, environment, network, server, or
provider dependency.

Publishing gates remain authoritative and unchanged. An explicitly disabled
gate may appear only as the warning `Publishing is off`; the projection never
turns a gate on or calls an action path.

## Performance and verification contract

`buildPostViews` builds per-collection ID indexes once and then projects the Post
list. The focused contract uses a deterministic production-like 100-Post fixture
and requires:

- projection below 100 ms;
- serialized output below 300 KB;
- zero input mutations;
- zero network requests;
- zero storage writes.

The measured 256,581-byte fixture is a detailed projection benchmark for the
pure adapter. It is not a proposed unpaginated list-endpoint payload; any future
list endpoint must define its own summary and pagination contract separately.

Run it with:

```bash
SKIP_ENV_LOCAL_FILE=1 npm run test:vnext-post-view-model
```

Because CCX-300 adds no runtime wiring or browser-facing UI, browser repeatability
is intentionally outside this packet.

## CCX-301 handoff

CCX-301 is technically unblocked once this contract lands. It can build Social
home groupings from immutable `PostView` records, retain existing authorized
Content Bank records for unconverted Ideas, and route every canonical Post card
to the exact Post deep link. Composer work and all mutation behavior remain
separate.
