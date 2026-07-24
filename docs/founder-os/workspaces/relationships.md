# Workspace — Relationships

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

**The existing Partner system supplies the foundation, but the product displays one CRM —
not disconnected Partner, prospect, campaign, and contact databases.** Relationships is a
projection over the seven existing identity stores (reuse ledger row 5); it creates no
new store and never destructively merges the campaign lanes.

## Universal identity model

- **Person vs organization:** two record kinds, linked. Person identity keys on
  normalized email (`companyContactId` — one contact per email, the rule the reactivation
  lane already enforces); organization identity keys on domain-or-name
  (`companyOrganizationId`).
- **Multiple roles per person:** roles are a set on one record (the existing
  `CONTACT_TYPES` vocabulary: partner_contact, prospect, investor, funder, vendor,
  attorney, media, support, internal, consumer types). An investor who is also a referral
  source and a Partner contact is **one record with three roles**, never three records.
- Source-lane records (outreach, reactivation, RCAP, lifecycle, prospects, partners)
  remain authoritative for their lanes and appear as linked facets of the unified record.

## What every relationship shows

- Pipeline stage (the existing partner stage vocabulary, extended per type)
- Strategic priority and relationship strength — two explicit fields on the projection.
  Relationship strength (how warm the connection is) is a NEW field; strategic priority
  (how much it matters) extends the existing partner priority. Both are founder-set, never
  inferred silently.
- Last inbound contact and last outbound contact (from interactions; the communication
  composer already stamps outbound on mark-sent)
- **Who owes the next move** — derived: last direction of communication vs open
  commitments; overridable
- Open commitments (inbox-intelligence commitment signals linked to this relationship)
- Next follow-up date and the current task
- Automation state (in outreach sequence / paused / none — from the campaign lanes)
- Suppression / eligibility state (from the suppression collections; read-only here,
  removal is a one-confirmation decision per the safety contract)

## Unified timeline

One timeline per relationship, merging: emails (inbox signals + manually recorded
sends), meetings (briefs + calendar signals), notes, tasks, commitments, campaign
activity (attempts), replies, files (data-room items linked to the record), support
issues, and stage changes. Sources are the existing collections listed in
`05_DATA_AND_INTEGRATION_CONTRACT.md`; the timeline is read-composed, not stored twice.

## Saved filters

All relationships · Follow-up due · Overdue · Waiting on me · Waiting on them · No
contact in 14/30/60 days · Replied · Meeting booked · Proposal active · Stalled · In
automated outreach · Suppressed · by role (Investors, Partners, Press, Vendors,
Customers). The six secondary views in `02_TARGET_PRODUCT_AND_IA.md` are the pinned
subset of these.

## Primary actions

Draft follow-up (communication composer) · Set next action · Complete next action · Add
task · Add note · Schedule or open meeting · Pause automation · Suppress contact · Add
file. "Log activity" is secondary — activity records itself as a byproduct of doing the
work (the mark-sent cascade already does this).

## Rules

- The projection deduplicates by email/domain; ambiguous matches surface for founder
  confirmation rather than silently merging.
- No new parallel contact store — prohibited by the reuse ledger.
- Suppression state is always visible and always wins: a suppressed contact shows why,
  and every drafting affordance respects it (the composer already blocks Gmail handoff
  for suppressed recipients).
