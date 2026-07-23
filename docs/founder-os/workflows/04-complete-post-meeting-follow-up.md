# Workflow 04 — Complete post-meeting follow-up

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
Send what I promised in the meeting and lock in the next step while it's fresh.

## Trigger
A meeting ends (calendar signal past end time) → its follow-up obligation surfaces in
Today.

## Entry points
Today → Meetings (post-meeting section); the relationship record.

## Context required
The meeting brief (attendees, objective noted in workflow 03), relationship context,
any commitments detected from the meeting thread.

## Primary action
Open the follow-up item → record outcomes (decisions, commitments made by each side —
each becomes a commitment/task on the right relationship) → draft the follow-up email
(Le-E-assisted) → Gmail handoff → mark sent → cascade (interaction recorded, stage
updated if changed, next follow-up set, item leaves Today).

## Secondary actions
Skip with reason (no follow-up needed); schedule the next meeting (Google Calendar
create link); snooze to later today.

## Automatic side effects
Commitments created and linked; relationship last-contact and stage updated; the meeting
item completes.

## Confirmation policy
None — internal records plus manually-sent email recording.

## Failure behavior
Same suppression/duplicate handling as workflow 01. Meeting had no CRM match: prompt to
create the relationship first (one step, in the panel — NEW glue).

## Exit state
Every promise from the meeting exists as a commitment with an owner and date; the
follow-up email is sent and recorded; the next touch is scheduled.

## Existing modules reused
`scripts/meeting-briefs.mjs`, `scripts/founder-calendar-service.mjs`,
`scripts/communication-composer-service.mjs`, `scripts/company-memory.mjs`
(commitment/queue records), `scripts/tasks-engine.mjs`, `scripts/lee-assistant.mjs`.

## Collections read
`meetingBriefs`, `calendarSignals`, `companyContacts`, `partners`, `tasks`,
`inboxSignals`.

## Collections written
`tasks`, `queueItems`, relationship collection, `emailDrafts`, `activityEvents`,
`auditHistory`, `meetingBriefs` (outcome note).

## External providers involved
Gmail (compose handoff only); Google Calendar (create-event link only).

## Safety gates
Same as workflow 01 (suppression, idempotency, drafts-never-send); calendar write
allowlist.

## Non-goals
Meeting transcription/recording; auto-generated minutes sent without review.

**NEW:** the post-meeting obligation surfacing in Today and the create-relationship-from-
attendee glue are new behavior; every underlying record and action is existing machinery.
