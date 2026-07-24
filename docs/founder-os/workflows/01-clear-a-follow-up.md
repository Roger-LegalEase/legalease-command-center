# Workflow 01 — Clear a follow-up

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
Answer a person who is waiting on me and set up the next touch, without leaving the item.

## Trigger
A follow-up is due, or an inbound message is waiting (inbox signal `needs_reply` /
`commitment`, relationship next-follow-up date arriving, campaign reply).

## Entry points
Today → Now/Next/Communications; Relationships → Follow-up due / Waiting on me; a
relationship record's timeline.

## Context required
The email summary and redacted evidence lines (inbox signal), relationship context (last
touches, stage, open commitment, suppression state), the related open task.

## Primary action
The ten-step chain, entirely inside the universal action panel:

1. Open the item from Today.
2. See the email summary, relationship context, and open commitment together.
3. Le-E prepares a draft (assist endpoint; suggestion only).
4. Roger edits, then sends manually — copy, or open in Gmail via the composer's Gmail
   handoff.
5. The interaction is recorded (mark-sent).
6. The related task is completed.
7. The relationship's last-contact date updates.
8. Any incompatible automated sequence stops (queued automation flagged for review).
9. The next follow-up is set (date + owed-by).
10. The item disappears from Today.

Steps 5–10 are one action from Roger's perspective: "Mark sent" triggers the cascade the
communication composer already performs (reuse ledger row 6).

## Secondary actions
Snooze; mark waiting (with who); mark blocked (with why); add a note; open the full
relationship; open the Advanced full record (artifact viewer).

## Automatic side effects
`activityEvents` ("Manual email sent") and `auditHistory` (`manual_email_recorded`)
entries; source signal resolved; queue item transitions to `completed` and leaves open
work.

## Confirmation policy
None — the send happens in Gmail by Roger's own hand; recording it is an internal action
(no-confirmation list, `06_SAFETY_AND_AUTOMATION_CONTRACT.md`).

## Failure behavior
Suppressed/bounced/unsubscribed recipient: the panel shows why and offers no Gmail
handoff (composer already blocks it). Duplicate mark-sent: 409 `already_recorded`, shown
as "already recorded", no double entry. Version conflict: reload the item, keep the
draft text.

## Exit state
Item gone from Today; relationship shows the outbound touch and the next follow-up;
task done; automation state consistent.

## Existing modules reused
`scripts/communication-composer-service.mjs` + `-api.mjs` (draft, Gmail URL, mark-sent
cascade), `scripts/inbox-intelligence.mjs` (signals, draft skeleton),
`scripts/lee-assistant.mjs` (assisted drafting, propose-only),
`scripts/task-workbench-service.mjs` (panel actions), `scripts/tasks-engine.mjs`.

## Collections read
`inboxSignals`, `emailDrafts`, `companyContacts`, `partners`, `outreachContacts`,
`reactivationContacts`, `prospectCandidates`, `tasks`, `supportIssues`, `outreachReplies`.

## Collections written
`emailDrafts`, the matched relationship collection (`partners`/`companyContacts`/…),
`tasks`, `approvalQueue` (automation flagged for review), `activityEvents`,
`auditHistory`, `queueItems` (transition), `inboxSignals` (resolved).

## External providers involved
Gmail — compose handoff only; **LegalEase sends nothing** (`externalActions: 0`).

## Safety gates
Suppression check on recipient; owner-only visibility of inbox data; request-id
idempotency; drafts-never-send invariant.

## Non-goals
Automated sending; bulk replies; editing campaign sequences from this panel; creating a
follow-up task *instead of* completing the current one.
