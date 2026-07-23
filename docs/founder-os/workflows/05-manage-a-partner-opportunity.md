# Workflow 05 — Manage a Partner opportunity

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
Move a Partner opportunity to its next stage — or decide honestly that it's stalled and
what to do about it.

## Trigger
Follow-up due on a pipeline relationship; a reply arrives from a partner contact; a
stage has had no movement past its expected window (Stalled filter).

## Entry points
Relationships → Pipeline / Follow-up due / Stalled; Today (when due); the organization
record.

## Context required
The unified record: stage, strategic priority, last inbound/outbound, who owes the next
move, open commitments, current task, files (proposals), outreach status.

## Primary action
From the record or the action panel: advance the work — draft and send the next
communication (workflow 01 chain), or complete the next action and set the new one, or
change the stage with a reason. Stage changes append to the timeline.

## Secondary actions
Add proposal file; schedule a meeting; pause automation for this contact; add a task;
mark waiting-on-them.

## Automatic side effects
Timeline entry; last-contact update; next-action rollover; pipeline metrics on the
Scoreboard reflect the stage change without re-entry.

## Confirmation policy
None for stage/notes/tasks (internal). One confirmation only if the action is an
external email send — which happens in Gmail by hand and is recorded, so in practice
none.

## Failure behavior
Conflicting concurrent edit: optimistic-version 409, reload with drafts preserved.
Suppressed contact: drafting affordances blocked with the reason shown.

## Exit state
The opportunity has a current stage, a next action with a date, and an owner of the next
move. Nothing "active" without a next step.

## Existing modules reused
`scripts/partners-home-service.mjs`, `scripts/partner-api-integration.mjs` (activity,
next-action, next-action/complete routes with scoped-write allowlists),
`scripts/partner-record-actions.mjs`, `scripts/partner-lifecycle.mjs`,
`scripts/communication-composer-service.mjs`.

## Collections read
`partners`, `partnerPrograms`, `partnerProgramArtifacts`, `pilots`, `companyContacts`,
`outreachContacts`, `tasks`, `dataRoomItems`, `campaigns`.

## Collections written
`partners` (stage, next action), `tasks`, `activityEvents`, `auditHistory`,
`emailDrafts` (via composer), `dataRoomItems` (files).

## External providers involved
Gmail (compose handoff); Google Calendar (meeting link).

## Safety gates
Scoped-write allowlist on partner mutations (unexpected collection change throws);
role-based record visibility; suppression respected in drafting.

## Non-goals
Bulk stage changes; automated pipeline progression; a second pipeline store.
