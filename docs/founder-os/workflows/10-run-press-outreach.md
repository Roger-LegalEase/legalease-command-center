# Workflow 10 — Run press outreach

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

**Scope note: this lane is NEW.** No press engine exists in main at current HEAD
(`01_CURRENT_STATE_REUSE_LEDGER.md` P10 — verified absence; the local
press-media-brain branch is not merged). Press exists today only as a classification in
read-only surfaces. Everything below that is not marked as reused infrastructure is NEW
scope, delivered per `08_DELIVERY_PLAN.md` Release 4.

## User objective
Pitch the right journalists with true, approved claims, follow up within limits, and
track coverage.

## Trigger
A story angle worth pitching; a journalist reply; a follow-up due on an open pitch.

## Entry points
Campaigns → Press outreach; Today (replies, follow-ups due).

## Context required
Journalist/publication records with beats and prior relevant coverage (NEW records in
the Relationships projection, role `media` — the contact type already exists);
**approved LegalEase facts and claims** (the approved-facts source: only ratified claims
may enter pitches); story angles; pitch status.

## Primary action
Develop a story angle → draft individualized pitches (never mail-merge) → approve the
campaign (one confirmation) → bounded follow-ups run under the shared campaign
infrastructure → stop on reply → record coverage, links, and the relationship history.

## Secondary actions
Park an angle; suppress a journalist; convert coverage into a content-bank fact for
Social.

## Automatic side effects
Stop-on-reply; pitch attempts recorded on the journalist's timeline; Scoreboard
Marketing press counters update (they exist today and read honest zero/Unavailable
until this lane runs).

## Confirmation policy
Approve content / release audience / run campaign — the same three distinct
one-confirmation decisions as every lane.

## Failure behavior
A pitch containing an unapproved claim must not be approvable (extends the guidelines-
gate pattern — NEW gate configuration, same enforcement shape: hard fail with named
reasons). Compliance, caps, window, claims: identical to partner outreach.

## Exit state
Every open pitch has a status and a next follow-up or a stop; coverage is recorded and
linked.

## Existing modules reused
Shared campaign infrastructure: `scripts/outreach-os.mjs` (approval, claims,
suppression, compliance, window, caps), `scripts/outreach-sequences.mjs` (sequence
shape), the Automation Control Center press-lane read models
(`scripts/automation-control-center-service.mjs`), `scripts/relationship-service.mjs`
(press category), scoreboard press counters
(`scripts/founder-scoreboard-service.mjs`).

## Collections read
`companyContacts` (role media), `companyOrganizations` (type media), outreach
collections for shared machinery, `contentBank` (approved facts).

## Collections written
NEW press-lane records (to be registered in `coreStateCollections` at build time —
distinct audience/claims/reporting per the charter; **sharing infrastructure, not
tables, with partner outreach**), plus `outreachSendClaims`-equivalent claims,
`activityEvents`, `auditHistory`.

## External providers involved
SendGrid (same gated sending path), Gmail handoff for one-off manual pitches.

## Safety gates
All shared gates apply unchanged; plus the NEW approved-claims-only gate. Audiences,
claims, copy, stop rules, and reporting remain distinct from partner outreach and
reactivation (charter requirement).

## Non-goals
Buying press lists; mass identical pitches; mixing journalist contacts into the partner
outreach audience; building a second campaign engine.
