# CCX-306A Social schedule plan

## Scope

`buildPostSchedulePlan(state, actor, postId, now)` is a pure, deterministic, authorization-aware read model for one exact Post. It composes merged CCX-300 `PostView`, CCX-302A `ComposerDraftView`, CCX-304A channel variants, and CCX-305 Social readiness. The caller-supplied valid `now` is its only clock.

This packet adds no calendar or scheduling UI, endpoint, browser controller, CSS, drag behavior, schedule write, date move, approval, publication, retry, provider call, storage write, Post or variant mutation, or CCX-306B behavior.

## Contract

The deeply immutable result contains canonical `postId` and `href`, caller-supplied `generatedAt`, a founder-facing schedule state, the exact stored shared timestamp and timezone, explicit selected channels, per-channel plans, standardized conflicts, non-executable guidance, compact source references, availability, diagnostics, and all-false capabilities.

Missing truth remains `null` or `unavailable`; it does not become false, zero, published, or a default timezone. Invalid stored date or timezone text remains visible as the exact safe stored value alongside its invalid state. An offset-less local value can remain a valid stored schedule while its absolute instant and due comparison remain unavailable.

## Source matrix

| Source | Contract use | Authority boundary |
| --- | --- | --- |
| CCX-300 `PostView` | Canonical Post identity, exact `#social/post/...` link, normalized shared schedule, and stored result evidence | No second identity or route is created |
| CCX-302A `ComposerDraftView` | Authorized exact-Post context, separate approval/readiness/publication truth, and privacy-safe source references | Composer capabilities remain false and readiness guidance remains non-executable |
| CCX-304A channel variants | Explicit selected channels, visible independent variants, stable channel order, and exact resolved variant references | A stored variant does not select its channel; an unselected variant is not a channel plan |
| CCX-305 Social readiness | Reviewed read-only schedule, approval, and publication checks | Approval does not schedule; scheduling does not publish |
| `posts.scheduledFor`, `scheduled_at`, `planned_date`, `plannedDate` | Exact PostView-reviewed shared schedule field, including present-empty and invalid truth | No date is fabricated or rewritten |
| `posts.timezone`, `timeZone`, `scheduleTimezone` | Exact PostView-reviewed stored timezone | No browser, server, or environment timezone is substituted |
| Explicit channel schedule maps | `channelSchedules`, `channel_schedules`, `perChannelSchedules`, and `per_channel_schedules` | Only exact channel map keys are related |
| Visible resolved channel variants | Optional channel schedule fields carried by the exact CCX-304A-selected variant record | Hidden or ambiguous variants contribute no channel schedule |
| Per-channel publish result map and related `publishEvents` | Explicit scheduled, failed, and published channel outcomes | Analytics absence never changes schedule truth |
| Explicit Post or related schedule-conflict records | Stable records whose lifecycle is explicitly `active`, `open`, `current`, or `conflicting` | Resolved, cleared, dismissed, closed, inactive, archived, hidden, unidentified, or unknown-lifecycle history never becomes an active conflict |

Repository inspection found the current scheduling runtime stores one shared Post schedule and timezone. Channel-specific support in this adapter is deliberately conditional: a channel timestamp appears only when an exact explicit channel map or the CCX-304A-resolved stored variant carries it. Shared timestamps are never copied into channel records.

## Schedule states

| State | Meaning |
| --- | --- |
| `unscheduled` | No schedule is stored and current stored status does not require one |
| `schedule_missing` | Stored status requires a schedule, a schedule field is explicitly empty, or only part of an explicit channel plan is timed |
| `scheduled` | A valid shared schedule exists, or every selected channel has an explicit valid schedule |
| `invalid_schedule` | Stored date or timezone truth is explicitly invalid |
| `schedule_conflict` | An explicit conflict, ambiguous channel timing, inconsistent shared/channel timing, or published-channel retry conflict exists |
| `already_published` | Every selected channel has explicit published evidence inherited from reviewed readiness truth |
| `unavailable` | The actor, Post, or supplied clock is unavailable |

The runtime’s existing due rule parses the stored value with `Date` and treats a valid timestamp at or before the clock as due; it does not classify the timestamp as invalid. This projection preserves that authority for authoritatively resolved instants: a valid past schedule stays `scheduled` and receives read-only due/past guidance. Date-only values use that existing runtime parse rule directly; the adapter does not append its own midnight suffix. It does not invent a posting-frequency, engagement, or rescheduling recommendation.

## Channel plans

One plan is returned for each explicit selected channel, in LinkedIn, Instagram, Facebook, X, Threads, then safe unknown-channel order. Selection does not imply an explicit channel schedule or customized variant. A stored unselected variant remains preserved by CCX-304A but does not enter `channelPlans`.

An explicit channel schedule retains its exact timestamp, timezone, and source reference. A channel governed only by the shared schedule has state `shared_schedule` with `scheduledAt: null` and `timezone: null`; this makes presentation inheritance clear without fabricating a stored channel record. Ambiguous exact records fail closed.

`publicationState` remains separate. Explicitly published channels are `already_published`; failed channels remain `failed_publication`; scheduled is not published. A partial result keeps successful channels distinguishable and out of any retry plan. Only an explicit retry list containing a published channel creates `published_channel_in_retry_plan`.

## Conflicts and timezone truth

An explicit `Z` or numeric offset is already an absolute instant. It is parsed directly and is never reinterpreted through a separate timezone field.

An offset-less local date-time is resolved only with its exact valid stored IANA timezone. The pure resolver finds candidate instants, formats each candidate back through `Intl.DateTimeFormat`, and requires every year, month, day, hour, minute, second, and millisecond component to match. A daylight-saving gap with no matching instant is invalid. A daylight-saving fold with multiple matching instants is ambiguous and becomes a conflict unless the stored timestamp contains an explicit offset.

An offset-less value with missing timezone remains exact, but its absolute instant is unavailable. It receives no due/past guidance. The adapter never appends `Z` or defaults to UTC, server time, browser time, environment time, or America/New_York.

The projection reports only supported truth:

- an explicit stored conflict or conflicting schedule status;
- an invalid stored date or timezone;
- more than one exact schedule for a channel;
- different shared and channel-specific absolute instants when both resolve authoritatively;
- an explicitly published channel present in an explicit retry list.

Identical local values with identical timezones do not conflict. A zoned New York local time and an explicit UTC timestamp representing the same instant do not conflict. When one or both instants are unavailable, the adapter returns `comparison_unavailable` and partial availability instead of fabricating inconsistency.

It never infers a conflict from analytics, engagement, posting frequency, filenames, copy, or browser locale. Missing timezone remains `null` and makes offset-less timing truth partial. A recognized stored IANA timezone is preserved exactly. An explicitly invalid timezone remains visible and produces `invalid_schedule`; it is never silently replaced. Resolved history and hidden conflict records affect neither state nor counts; unknown lifecycle truth fails closed as unavailable rather than active.

## Authorization, privacy, determinism, and side effects

Missing or unknown actors fail closed. Visibility is applied before Posts, embedded variants, conflict records, related publication records, sources, or counts are composed. Hidden Posts return no ID, link, sources, or counts. Hidden variants and conflicts do not affect output or diagnostics.

Stable exact identities, reviewed channel order, standardized conflicts, and sorted source references make input order irrelevant. The result and every nested value are frozen. The model returns no credentials, tokens, environment values, signed URLs, local absolute paths, provider payloads, raw audits, raw rule IDs, or executable action intents.

Network requests, storage writes, schedule writes, date moves, drag operations, approvals, publications, retries, provider calls, and source/Post/variant mutations remain zero.

## Performance and rollback

The focused adapter benchmark projects 100 detailed Posts and 500 selected-channel plans with shared and channel-specific timing, scheduled result truth, missing timezones, and explicit conflicts. It reports source candidates examined, Posts projected, channel plans, scheduled plans, conflicts, unavailable fields, projection time, aggregate serialized size, and every mutation/action count.

This is an aggregate adapter benchmark, not a calendar endpoint or single-response payload proposal. Rollback removes the two pure modules, focused test, this document, and additive package script; no migration, runtime, UI, browser code, or stored data needs reversal.

## CCX-306B handoff

CCX-306B may consume this immutable projection for a separately reviewed scheduling interface. It can use canonical identity/link truth, exact shared and channel timestamps, selection and publication separation, standardized conflicts, timezone availability, and non-executable guidance without recomputing authorization. CCX-306B must add separately reviewed edit, persistence, conflict-resolution, approval, scheduling, and publication controls; this contract grants none of them.
