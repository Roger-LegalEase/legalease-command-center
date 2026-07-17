# Partner stage adapter

## Purpose

`PartnerStageView` is a pure founder-facing projection over the authoritative
`partners` collection. It translates the repository's detailed internal Partner
lifecycle into a smaller commercial stage vocabulary without rewriting,
normalizing, advancing, or regressing stored Partner records.

The adapter has no endpoint or UI integration. It performs no Partner-stage
update, email, meeting scheduling, Campaign creation, proposal generation,
provider call, storage write, migration, or external action.

## Repository truth inspected

The authoritative lifecycle in `partner-lifecycle.mjs` uses these canonical
internal stages:

- `lead`
- `qualified`
- `intro_scheduled`
- `proposal_sent`
- `pilot_scoped`
- `contract_pending`
- `active_pilot`
- `reporting`
- `renewal`
- `case_study`
- `expansion`
- `stalled`
- `lost`

Current Partner fixtures and producers also store:

- `new` from Global Create;
- `target_identified`, `contact_found`, `outreach_sent`, `pitching`,
  `meeting_requested`, `meeting_scheduling`, `meeting_booked`, `verbal_yes`,
  `signed_pilot`, `campaign_live`, `onboarded`, `paused`, `dormant`, and
  `closed_lost`, which the current lifecycle already treats as aliases;
- `active` and `live` in established Partner fixtures;
- explicit `inactive` or `archived` truth;
- `production_activation`, an operational review stage created for RCAP that is
  not a commercial Partner lifecycle stage.

Linked `pilots` currently include statuses such as `proposed`, `scoped`,
`proposal_sent`, and `active`. Linked `partnerPrograms` have their own larger
status contract, including lead, proposal, payment, onboarding, activation,
reporting, renewal, expansion, stalled, and lost states. Those records provide
context only. Their status never changes the projected Partner stage.

## Founder-facing `uiStage` mapping

The normal primary pipeline has exactly six stages. `unavailable` is a neutral
fallback, not a seventh pipeline stage.

| `uiStageKey` | Label | Internal Partner truth |
| --- | --- | --- |
| `new` | New | `new`, `lead`, `target_identified`, `contact_found` |
| `qualified` | Qualified | `qualified`, `outreach_sent`, `pitching` |
| `in_conversation` | In conversation | `intro_scheduled`, `meeting_requested`, `meeting_scheduling`, `meeting_booked` |
| `proposal` | Proposal | `proposal_sent`, `pilot_scoped`, `verbal_yes`, `contract_pending` |
| `active` | Active | `active_pilot`, `signed_pilot`, `reporting`, `campaign_live`, `onboarded`, `renewal`, `case_study`, `expansion`, `active`, `live` |
| `closed` | Closed | `lost`, `closed_lost`, `inactive`, `archived`, or explicit archive/inactive truth |

These mappings read the current stored lifecycle truth; they do not derive stage
movement from activity records. For example, `outreach_sent` maps through the
repository's existing lifecycle alias, but an email activity record or loose note
does not establish qualification.

Closed preserves a separate truthful outcome. `lost` and `closed_lost` produce
Lost; explicit inactive truth produces Inactive; and explicit archive truth
produces Archived. Outcome detail is never collapsed into the Closed label.

## Health and attention

`stalled`, `paused`, and `dormant` are not primary pipeline stages. They produce
the health condition `needs_attention` / Needs attention while preserving the
exact internal stage.

The adapter preserves a primary `uiStage` for such a record only when a stored
`commercialStage`, current/prior/previous commercial-stage field, or a
timestamped structured Partner history stage establishes it. Structured stage
fields are read; notes and activity prose are not parsed. If no commercial stage
is explicitly established, the primary stage is Stage unavailable with fallback
`attention_without_commercial_stage` and the Needs attention condition remains
available. The adapter never guesses In conversation or Active from a pilot,
program, proposal, email, meeting, stale activity, or vague context.

## Neutral fallback

An unknown internal stage produces:

- founder stage key `unavailable`;
- label `Stage unavailable`;
- fallback reason `unknown_internal_stage`;
- the exact internal stage retained for reference.

A missing internal stage uses the same neutral stage with
`missing_internal_stage`. `production_activation` uses
`operational_only_stage` because it is an operational review state, not evidence
of commercial Partner progress.

The adapter never falls back to New, Qualified, In conversation, Proposal, or
Active. Missing activity is
not risk, and missing stage data is distinct from explicit inactive/archive
truth.

## Qualification, risk, and activity truth

Qualification is available only from explicit fields such as a qualification
status, qualification boolean, or qualification timestamp. Notes, proposal
records, pilot records, and program records cannot establish it.

Relationship health preserves explicit `riskLevel`, `relationshipHealth`, and
blocker fields. An explicit stalled, paused, or dormant lifecycle stage supports
Needs attention, not a pipeline stage. Explicit high/critical risk or an explicit
attention-like relationship-health value may also produce Needs attention. No
current-clock comparison exists, so old or missing activity never creates risk.

Last meaningful activity is selected deterministically from:

- explicit Partner response, activity, touch, or contact timestamps;
- timestamped Partner history entries;
- explicitly ID-linked `activityEvents`, `auditHistory`, or
  `automationEvents` records.

The adapter does not join activity by Partner name, organization name, notes, or
other fuzzy text. It does not expose message bodies or raw event payloads.

## Linked pilot and program context

Pilots and programs join only through a stable `partnerId`, `relatedPartnerId`,
or an explicit related-record ID stored on the Partner. Returned context is a
small reference summary: ID, source collection, name, status, and owner.

An active pilot does not move a New Partner to Active. A proposal record does
not make a Partner Qualified or move its stage. A linked active Partner Program
does not move the Partner at all.

## Included fields

The recursively frozen view includes:

- namespaced stable identity `partner:<id>`;
- Partner name and authoritative source identity;
- exact `#partners/partner/<encoded-id>` link;
- exact source references for the Partner, linked pilots/programs, and selected
  activity;
- original internal stage and normalized internal-stage key;
- `uiStage` key, label, plain-English explanation, source, fallback, and explicit
  commercial-stage evidence where needed for an attention-only internal state;
- separate Closed outcome and relationship attention detail;
- explicit qualification truth;
- stored next action and due date;
- current owner when stored;
- explicit relationship health, risk, and blocker summary;
- explicitly linked pilot/program context;
- last meaningful activity metadata;
- created, updated, archive, and inactive timestamps.

## Deferred fields

The adapter intentionally excludes or defers:

- automatic lifecycle changes or recommendations to change stage;
- qualification inferred from notes, messages, proposals, meetings, or linked
  records;
- risk inferred from elapsed time or missing activity;
- derived relationship scores, pipeline probability, expected value, revenue,
  and funnel metrics;
- contact details, email bodies, meeting notes, proposal content, and raw event
  payloads;
- pilot/program actions, Campaign creation, proposal generation, and follow-up
  sending;
- endpoints, UI controls, browser integration, pagination, and storage changes.

## Authorization and purity

Projection fails closed unless the actor is authenticated, has a known role, and
has `read_internal`. Existing per-record visibility, sensitivity, and
`allowedRoles` rules apply to Partners and related records.

The modules read no environment variables or current clock and use no network,
filesystem, storage, browser, server, lifecycle-engine, program-engine, or
provider APIs. Output ordering is stable, duplicate Partner IDs resolve
deterministically, output is recursively frozen, and input objects are never
frozen or mutated.

## Detailed adapter benchmark

The focused test projects at least 100 deterministic production-like Partner
records with linked pilots, programs, and activity. It enforces a 100 ms
projection budget and a 350 KB detailed-output budget while reporting network
requests, storage writes, source mutations, and Partner-stage changes.

This is a pure adapter benchmark, not a proposed unpaginated endpoint payload.
Any future endpoint must define its own authorization, summary shape,
pagination, and payload budget.
