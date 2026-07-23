# Workflow 08 — Run reactivation

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
Operate the reactivation campaign — run, stop, release audiences, review replies — with
full visibility and zero engine jargon.

## Trigger
Routine campaign check; a threshold trip or exception in Today Needs attention; a new
wave ready for release; replies to review.

## Entry points
Campaigns → Reactivation; Today → Needs attention (exceptions only).

## Context required
Running/stopped state, current audience and released waves, contacts due, next send
window, delivery metrics, threshold status, last successful check, last provider
response, exact blocked-reason when blocked (all from existing status functions —
translated per `workspaces/campaigns.md`).

## Primary action
The obvious controls, each mapped to an existing route: **Run / Stop / Resume**
(`POST /api/reactivation/live-mode`, pause/resume routes) · **Release next approved
wave** (wave-release preview → propose → execute; execute requires the matching approved
Approval) · **Preview next sends** · **Review replies** · **Review suppressed contacts**.

## Secondary actions
Adjust audience holds (held-release confirm); view attempt history for a contact
(timeline); export nothing to repo (privacy rule).

## Automatic side effects
State transitions recorded in `reactivationCampaign`; approvals recorded; exceptions
clear from Today when resolved; Scoreboard Marketing updates.

## Confirmation policy
**Run campaign** and **Release audience** are one-confirmation decisions (distinct
decisions — never collapsed, `06_SAFETY_AND_AUTOMATION_CONTRACT.md`). Stop is immediate
and unconfirmed. Reviewing is internal.

## Failure behavior
Threshold trip: campaign auto-pauses **before** sending and Today shows "Campaign
stopped for safety" with the reason; resume requires the propose→execute path. Blocked
send window/caps: the surface shows the exact reason (the decision functions return it).
Provider errors: claim marked failed, no silent retry.

## Exit state
Campaign state is what Roger chose; every release is backed by an approval; no
unexplained blocked state.

## Existing modules reused
`scripts/reactivation-os.mjs` (all authority), `scripts/campaign-command.mjs` (controls,
delegating), `scripts/reactivation-sequences.mjs`, `scripts/sendgrid-webhook.mjs`
(delivery feedback), heartbeat reactivation-sequencer engine (invisible).

## Collections read
`reactivationCampaign`, `reactivationContacts`, `reactivationAttempts`,
`reactivationEvents`, `reactivationSendClaims`, `approvals`, `approvalQueue`,
`sendgridWebhookHealth`, `heartbeatRuns`.

## Collections written
`reactivationCampaign` (run/stop/wave state, scoped writes), `approvals`,
`approvalQueue`, `reactivationContacts` (holds), `auditHistory`.

## External providers involved
SendGrid (sends by the engine under its gates; signature-verified webhook feedback).

## Safety gates
All four independent layers unchanged (live-mode authority + kill switch, autopilot,
wave release, threshold auto-pause) plus claims, suppression, window, caps —
`evidence/safety-gates.md`. The founder surface adds none and removes none.

## Non-goals
Editing sequence copy mid-flight; bulk unsuppression; exposing engine IDs, autopilot
toggles, or heartbeat internals to the founder surface.
