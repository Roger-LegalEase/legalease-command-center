# Workflow 06 — Triage a customer issue

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
Get a customer unblocked (or honestly queued) and make sure nothing urgent is waiting on
LegalEase.

## Trigger
New support intake; an issue transitions to urgent; an issue is waiting on LegalEase
past the response target.

## Entry points
Today → Needs attention (urgent/waiting items); the full support queue (secondary view);
the customer's relationship record.

## Context required
Issue text and classification (existing classifier), urgency, status, the customer's
relationship/timeline, prior issues.

## Primary action
Open the issue in the action panel → read summary → draft the reply
(`prepareSupportDraftReply`) → send via Gmail handoff → mark sent → transition the issue
(`open → drafted → waiting → resolved`) — one flow, no page-hopping.

## Secondary actions
Escalate urgency; link to a refund decision (one-confirmation delete/refund class);
create a fix task; mark recurring-category.

## Automatic side effects
Issue timeline on the customer relationship; Scoreboard Customer metrics update; Today
item clears on transition out of urgent/waiting-on-us.

## Confirmation policy
None for triage/transition/draft (internal); the reply is sent by hand in Gmail and
recorded.

## Failure behavior
Invalid transition rejected by the state model; drafts preserved. Intake without a
matching contact: issue stands alone and offers relationship creation.

## Exit state
No urgent issue unowned; every waiting-on-LegalEase issue has a drafted or sent
response; resolved issues leave Today.

## Existing modules reused
`scripts/support-desk.mjs` (states, classifier, draft, transition),
`scripts/founder-support-service.mjs`/`-api.mjs` (founder view, restricted writes),
`scripts/communication-composer-service.mjs`.

## Collections read
`supportIssues`, `companyContacts`, `growthInbox`, `tasks`, `inboxSignals`.

## Collections written
`supportIssues` (transitions), `tasks`, `activityEvents`, `auditHistory`, `emailDrafts`.

## External providers involved
Gmail (compose handoff only). Intake arrives via the existing support intake route.

## Safety gates
Founder support writes restricted by `ALLOWED_WRITE_COLLECTIONS`; state-model
transitions enforced; suppression respected.

## Non-goals
Auto-replies to customers; SLA automation that emails without Roger; a separate helpdesk
product.
