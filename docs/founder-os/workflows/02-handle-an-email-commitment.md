# Workflow 02 — Handle an email commitment

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
Keep a promise I made (or collect on one made to me) before it slips.

## Trigger
Inbox intelligence detects a commitment (`inboxSignals` kind `commitment`, with `dueAt`);
or the commitment's due date arrives/overdues (escalation).

## Entry points
Today → Now/Next (overdue commitments rank high); the relationship record's open-
commitment field; Communications.

## Context required
The commitment text (redacted evidence lines), who owes whom, due date, the conversation
summary, relationship context.

## Primary action
From the universal action panel: fulfill it — draft the promised reply/deliverable note
(Le-E-assisted), send via Gmail handoff, mark sent → the commitment resolves, the
interaction records, the relationship updates (same cascade as workflow 01). If the
other party owes: send the nudge, mark waiting-on-them with a resurface date.

## Secondary actions
Convert to a dated task (only when genuine future work is required — not as a completion
substitute); reschedule the due date; mark no-longer-relevant with a note.

## Automatic side effects
Commitment signal resolved; task auto-completed if one was linked; overdue escalation
stops; activity + audit entries.

## Confirmation policy
None — internal actions and manually-sent email recording.

## Failure behavior
Signal references a thread that no longer matches (stale evidence): panel shows the
honest state and offers re-scan (`POST /api/inbox/scan`). Suppressed recipient: same as
workflow 01.

## Exit state
No open commitment without an owner and a date; nothing overdue silently.

## Existing modules reused
`scripts/inbox-intelligence.mjs` (commitment detection, `dueAt` escalation),
`scripts/communication-composer-service.mjs`, `scripts/lee-assistant.mjs`,
`scripts/tasks-engine.mjs`, `scripts/task-workbench-service.mjs`.

## Collections read
`inboxSignals`, `companyContacts`, `partners`, `tasks`, `emailDrafts`.

## Collections written
`inboxSignals` (resolution), `emailDrafts`, `tasks`, relationship collection,
`activityEvents`, `auditHistory`, `queueItems`.

## External providers involved
Gmail (read-only detection, toggle-gated; compose handoff for the reply). No sends by
LegalEase.

## Safety gates
Inbox toggle gate + single authorized mailbox; owner-only signal visibility; redacted
evidence only (never bodies); drafts-never-send.

## Non-goals
Auto-fulfilling commitments; nagging automation that emails counterparties without
Roger; treating "created a task" as "kept the promise".
