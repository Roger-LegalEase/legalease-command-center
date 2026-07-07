# Phase 18 — Brain / Nerve-Center Build Plan

Approved 2026-07-03. Turns the Command Center from a dashboard into the operating layer Roger
runs the company from: one queue, agent-prepared recommendations, plain-English controls,
honest source-of-truth status, safe approval gates, audit trails. This document is the
working plan; the deep audit lives in the session record and the original
`legalease-command-center-brain-nerve-center-build-plan.md` (repo root), whose Phases 0-3
are already built (trust layer, company memory, intake, campaign command).

## Architecture

```
SOURCES  (Stripe, signups, SendGrid webhook, product events, Google signals, operator input)
  -> ENGINES        (heartbeat plan/act; plan() always runs, act() only behind gates)
    -> COMPANY MEMORY (queueItems, approvals, agentRuns, companyEvents, contacts, orgs)
      -> PROJECTOR    (buildTodaySummary + per-brain views)
        -> COCKPIT MODULES (CK_DASHBOARD_MODULES registry) + brain pages
```

Rule: every engine output that wants attention becomes a queue item; every queue item that
acts externally requires an approval; every decision and execution emits a company event.

## Autonomy levels (declarative, mapped onto existing enforcement)

| Level | Meaning | Mechanism |
|---|---|---|
| 0 | Read-only summary | plan() only, no act path |
| 1 | Draft recommendation | internal drafts only |
| 2 | Prepare for approval (DEFAULT for external) | queue item + requested approval |
| 3 | Execute after explicit approval | executeApproved* re-checks safety |
| 4 | Auto, safe internal housekeeping only | autopilot toggle, default OFF |

## Shared data statuses

`connected / not_connected / needs_attention / loading / error / no_data / draft /
needs_approval` (exported as `DATA_STATUSES` from company-memory.mjs). No fake metrics, ever.

## Phases / PR boundaries

- **18B Queue foundation (this PR):** `dueAt` + `sourceLink` + `related` on queue items;
  decision audit events into companyEvents; Open control on Needs Roger cards; the
  Decisions page (full queue, approve/snooze/dismiss/complete/open); shared DATA_STATUSES.
  No external side effects. The social-post Review Desk (`#queue`) is untouched; the
  legacy cockpit aggregator stays on the old cockpit page.
- **18C Agent runs + autonomy registry:** review fields (purpose, risk,
  recommendedNextStep, approvalRequired, queueItemId/approvalId, reviewedAt/By,
  finalAction) on agent runs; direct recording from campaign-command and intake;
  `AUTONOMY_LEVELS` per-engine ceilings rendered in plain English and pinned by a test.
- **18D Support + inbox draft layer:** supportIssues schema/writer/page; growthInbox
  urgent + UPL-sensitive flagging; internal draft replies. Never sends. Live Gmail
  reading is NOT wired (read-only scopes exist, no fetch) - separate integration decision.
- **18E Campaign brain completion:** B2 partner-outreach lane view; held-for-review
  surfacing with release-from-hold preview/confirm (no send); deliverability warnings.
- **18F RCAP partner ops:** display-only partnerUsage from `partner_usage_window` events;
  onboarding checklist derived from lifecycle stages; packet counts displayed from
  existing inbound event metrics. Cap ENFORCEMENT does not exist and is not being created.
- **18G Settings rebuild:** nine business sections (Company profile / Email and campaigns /
  Social media / Partner program / Customer support / Revenue and Stripe / Notifications /
  Safety and approvals / Integrations); technical detail behind one disclosure; no
  developer-speak in primary copy.
- **18H Meeting briefs:** persisted brief model + generator; partly blocked on the same
  Google live-fetch decision as 18D.
- **18I Alert system (approved by Roger 2026-07-07):** internal `alerts` collection raised
  from four source groups (needs-Roger queue items; safety and deliverability; money
  signals; support and partners). In-app Alerts center page with severity lanes and
  read/dismiss. Email delivery to the OWNER'S single locked address only, behind an
  off-by-default gate toggled on the Alerts page (NOT in Settings — Settings stays
  display-only); cadence = daily digest plus immediate breakthrough for critical items.
  Never emails contacts, customers, or partners; never a campaign path. Settings
  Notifications section becomes a live status display pointing at the Alerts page.

## Hard guardrails (all phases)

Never touch: Expungement.ai DTC, RCAP packet generation (not in this repo; inbound events
only), partner cap logic (does not exist; do not create enforcement), Stripe payment
behavior, Briefcase. Never send email, post to social, or mutate production data from
these features. Prospect self-approval lockout stays intact. New collections must be
registered in coreStateCollections; writes use scoped writeCollections; no secret env-var
names in served HTML.
