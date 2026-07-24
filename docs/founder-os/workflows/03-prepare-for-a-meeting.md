# Workflow 03 — Prepare for a meeting

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
Walk into a meeting knowing who I'm meeting, where the relationship stands, and what I
want out of it.

## Trigger
A meeting on today's agenda (calendar signal), ranked by start time in Today → Meetings.

## Entry points
Today → Meetings; the relationship record's meetings; Le-E's morning brief.

## Context required
Event details (read-only calendar), attendee ↔ relationship matches, relationship stage
and open commitments, prior meeting follow-ups, optionally recent email snippets.

## Primary action
Open the meeting item → the prepared brief (attendees, relationship context, open
threads, suggested objectives). Request email context on demand when needed (explicit,
capped snippets). Add the intended outcome as a note on the brief.

## Secondary actions
Open the full relationship; add a preparation task; open the event in Google Calendar;
draft a pre-meeting message (workflow 01 chain).

## Automatic side effects
Brief stored (`meetingBriefs`); preparation state visible on the Today item; a
post-meeting follow-up obligation is queued for after the end time (feeds workflow 04).

## Confirmation policy
None — read-only preparation plus internal notes. Fetching Gmail snippets is on-demand
by explicit click, never background (existing design).

## Failure behavior
Calendar not connected: honest Unavailable state with the connect path in Settings —
never an empty fake agenda. Attendee matches nothing in the CRM: the brief says so and
offers to create the relationship.

## Exit state
Brief read, objective noted; the meeting item shows "prepared".

## Existing modules reused
`scripts/meeting-briefs.mjs` (brief build, on-demand email context, briefs engine),
`scripts/founder-calendar-service.mjs`/`-api.mjs`, `scripts/google-workspace.mjs`
(read-only fetch).

## Collections read
`calendarSignals`, `meetingBriefs`, `companyContacts`, `partners`, `tasks`,
`googleInsights`, `inboxSignals`.

## Collections written
`meetingBriefs`; calendar actions may write only `tasks`, `auditHistory`,
`activityEvents` (existing allowlist).

## External providers involved
Google Calendar (read-only); Gmail (on-demand snippets, capped at 240 chars, max 3 per
attendee, never bodies in background).

## Safety gates
`/api/meeting-briefs/prepare` owner/admin only; calendar write allowlist; read-only
calendar scope.

## Non-goals
Editing calendar events; auto-sending agendas; background email scanning for briefs.
