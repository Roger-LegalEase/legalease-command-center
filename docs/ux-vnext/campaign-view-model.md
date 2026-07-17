# Unified Campaign view model

## Purpose

`CampaignView` is a pure founder-facing projection over the current Outreach
campaign systems. It gives those systems one read contract without merging,
rewriting, or taking authority from their stored records.

The adapter has no endpoint or UI integration. It performs no approval,
enrollment, scheduling, release, resume, send, provider, suppression, or storage
action.

## Source mappings

| Founder-facing source | Authoritative repository source | Stable adapter identity | Source link |
| --- | --- | --- | --- |
| Canonical Campaign | `campaigns[]` | `campaign:<campaign.id>` | Exact typed link `#outreach/campaign/<encoded-id>` |
| Partner outreach | `outreachCampaigns[]` | `outreach:<campaign_id>` | Existing Outreach destination `#campaigns` |
| Customer re-engagement | `reactivationCampaign` singleton | `reactivation:<campaign_id-or-mvp-reactivation>` | Existing Outreach destination `#campaigns` |

The namespaces intentionally keep equal source IDs distinct. Reactivation is an
adapter over the singleton and is not copied into `campaigns`. Social/Post
campaign records are not projected as Outreach campaigns.

Relationships use explicit stable IDs:

- canonical approvals and activity join through `sourceRef.collection ===
  "campaigns"`, the Campaign ID, and approval queue-item IDs;
- partner outreach contacts, sequence steps, attempts, replies, suppressions,
  unsubscribes, bounces, and approval messages join through `campaign_id`,
  `enrolled_campaigns`, or a related `contact_id` already enrolled in that
  Campaign;
- reactivation contacts, attempts, events, claims, queue items, and approvals
  join through the stable reactivation Campaign ID, related `contact_id`, and
  approval queue-item IDs.

There are no joins by names, subjects, message bodies, recipient addresses, or
other fuzzy text.

## Campaign type and delivery mode

| Repository truth | Founder-facing Campaign type |
| --- | --- |
| `campaignType: "partner_outreach"`, canonical partner evidence, or `outreachCampaigns` | Partner outreach |
| `campaignType: "customer_reengagement"` or `reactivationCampaign` | Customer re-engagement |
| `campaignType: "announcement"` | Announcement |

Unknown canonical Campaign types remain unavailable unless stable partner
evidence supplies the Partner outreach mapping. Explicit Social/Post/content
campaign types are excluded.

| Repository truth | Founder-facing delivery mode |
| --- | --- |
| Explicit one-time/single/broadcast mode, one stored step, or one stored message | One-time message |
| Explicit sequence/follow-up mode or more than one stored step | Follow-up sequence |
| Reactivation's stored five-touch cadence | Follow-up sequence |

When none of those facts exists, delivery mode remains unavailable. The
reactivation sequence summary preserves the current `[1, 4, 9, 16, 30]` cadence
days without exposing message bodies.

## Included fields

`CampaignView` includes only facts supported by the relevant stored source:

- namespaced stable identity, raw source identity, source collection, source
  references, and truthful safe source link;
- Campaign type and delivery mode;
- name, goal, owner, next action, and source timestamps;
- founder-facing status plus the unmodified internal source status;
- audience summary, included count, excluded count, and categorized exclusion
  counts when selected audience or related enrollment collections make them
  knowable;
- message or sequence summary, sequence name, step count, first subject, and
  reactivation cadence, without recipient data or message bodies;
- schedule time, time zone, and separate sent truth;
- approval state, approval-record count, and explicit separation from execution;
- explicit sender connection, sending-enabled, readiness, and sent-count truth;
- paused/completed truth, pause reason, stored resume state, and reactivation's
  resume-approval requirement;
- stored reply, meeting, outcome, referral, visit, start, conversion, and revenue
  facts when available;
- safe activity metadata: stable record ID, collection, kind, status, and stored
  timestamp.

Status normalization is presentation-only: Draft, Scheduled, Active, Paused, or
Completed. It never changes the source status. In particular, paused is not
completed, scheduled is not sent, approval is not execution, and sender
connection is not sending enablement.

Audience exclusion reflects the current engines' stored facts, including do-not-
contact, unsubscribe, bounce, complaint, reply, existing-customer, suppression,
hold, and duplicate signals. It neither changes suppression state nor makes a
sending decision.

## Missing and deferred fields

Missing values remain `null` or otherwise explicitly unavailable. An empty,
authoritative related collection may truthfully produce zero; an absent
collection or unselected audience does not. The adapter never fabricates
audience size, replies, meetings, outcomes, analytics, enablement, readiness, or
execution.

The following remain deferred:

- a typed object route for `outreachCampaigns`;
- a typed object route for the `reactivationCampaign` singleton;
- environment-only provider readiness and live-send gates that are not stored in
  the input state;
- derived funnel rates, attribution, or aggregate analytics not stored on the
  Campaign;
- recipient-level details, message bodies, provider payloads, claims, and raw
  suppression data;
- UI actions, endpoint shapes, pagination, and browser-controller behavior.

Until route parity exists, adapted partner outreach and reactivation records keep
the truthful current `#campaigns` source link. They do not invent a typed route.

## Safety and authorization

The projection fails closed unless the actor is authenticated, has a known role,
and has `read_internal`. Existing per-record `allowedRoles`, sensitivity, and
visibility rules are applied to root and related records. The returned contract
is recursively frozen, input collections are never frozen or mutated, and all
output ordering is stable.

The pure modules import no server, storage, database, provider, sending,
reactivation execution, campaign command, or company-memory engine. They read no
environment variables or current clock and use no network, filesystem, browser,
or storage APIs.

## Detailed projection benchmark

The focused contract projects 100 deterministic production-like Campaign
records, verifies recursive immutability and input-order independence, and
records elapsed time and serialized output size. It enforces a 100 ms projection
budget and a 350 KB detailed-output budget, alongside zero network requests,
storage writes, Campaign executions, and source mutations.

This measured fixture is a detailed pure-adapter projection benchmark. It is not
a proposed future unpaginated list-endpoint payload. Any future endpoint must
define its own authorization, summary fields, pagination, and payload budget.
