# Workflow 09 — Run partner outreach

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
Approve outreach to the right prospective Partner organizations and convert replies into
real opportunities.

## Trigger
New ranked prospects from discovery; queued outreach awaiting approval; a reply arrives.

## Entry points
Campaigns → Partner outreach; Today (replies and approvals that need judgment).

## Context required
Ranked prospect list with reason-for-inclusion and strategic score; duplicate/existing-
relationship detection against the CRM; the drafted personalized sequence; suppression
status; campaign performance (sent, replies, bounces).

## Primary action
Review the ranked list → approve a campaign or segment (the human approval that the
engine requires — code can never write `approved`) → the engine runs bounded follow-ups
under its gates → on reply, sequence stops automatically and the reply lands in Today →
Roger converts a qualified reply into a CRM opportunity with a meeting or follow-up task
(workflow 05 takes over).

## Secondary actions
Reject a prospect with reason; edit the draft before approval; suppress an organization;
pause a segment.

## Automatic side effects
Stop-on-reply (suppression reason `replied`); attempts and replies recorded; queue items
for replies; Scoreboard Pipeline/Marketing update.

## Confirmation policy
**Approve content**, **Release audience** (approve a segment), and **Run campaign** are
distinct one-confirmation decisions. Reply conversion is internal.

## Failure behavior
Compliance failure (CAN-SPAM assembly) blocks the send and surfaces the reason; caps/
window defer with reason; claim conflicts skip (duplicate-send protection); executor
failures mark the queue item rejected — never silent.

## Exit state
Only approved, compliant, unsuppressed prospects in flight; every reply owned; qualified
replies live in the CRM pipeline.

## Existing modules reused
`scripts/outreach-os.mjs` (queue-then-approve, gates, claims),
`scripts/outreach-sequences.mjs` (fail-closed routing),
`scripts/prospect-discovery.mjs` + `prospect-datasets.mjs` (ranked candidates; flag-gated
discovery), `scripts/outreach-home-service.mjs`, `scripts/growth-inbox.mjs` (replies).

## Collections read
`prospectCandidates`, `outreachOrganizations`, `outreachContacts`, `outreachCampaigns`,
`outreachSequenceSteps`, `outreachAttempts`, `outreachReplies`, `outreachSuppressions`,
`outreachConfig`, `partners`, `companyContacts`.

## Collections written
`outreachCampaigns`/queue records (approvals), `outreachAttempts`, `outreachReplies`,
`outreachSendClaims` (engine), `partners` (converted opportunities), `tasks`,
`auditHistory`.

## External providers involved
SendGrid (engine sends under `OUTREACH_LIVE_SEND` + gates; webhook feedback).

## Safety gates
Queue-then-approve; live-send env gate default off; suppression (8 reasons, checked
twice); CAN-SPAM validation; sending window; volume caps; durable claims —
`evidence/safety-gates.md`. Discovery loaders never attach emails, so discovered orgs
cannot become sendable without explicit contact enrichment and approval.

## Non-goals
"Send everyone"; auto-approval; discovery flag flips from this surface; merging outreach
contact stores into the CRM store.
