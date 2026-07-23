# Workflow 11 — Review company performance

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
Know in minutes whether LegalEase is healthy — cash, growth, pipeline, customers,
marketing, platform — and turn any bad number into an action.

## Trigger
The daily first-15-minutes check; the weekly deeper review; a Needs-attention KPI
anomaly surfacing in Today.

## Entry points
Scoreboard; Today (anomalies only); Le-E ("explain this change").

## Context required
Every metric with its full per-metric contract (definition, source, freshness, current,
previous, target, variance, status label — `workspaces/scoreboard.md`).

## Primary action
Read the six sections → for any Needs-attention or off-target metric, follow its
**corrective action link** into the workspace where the fix happens (low replies →
Campaigns Monitor; overdue follow-ups → Relationships Follow-up due; urgent support →
Today) — and do the work there. Update Manual inputs (cash, burn) when they've changed.

## Secondary actions
Set/adjust a target; ask Le-E to explain a variance; open Platform health detail;
record a weekly note.

## Automatic side effects
Manual inputs persist (`runwayInputs`); viewed anomalies clear from Today when the
underlying metric recovers; nothing else — reading is side-effect-free.

## Confirmation policy
None — reading and manual inputs are internal.

## Failure behavior
A disconnected source shows **Unavailable** with its connect path — never zero, never a
neighbor metric standing in (honesty rules, `workspaces/scoreboard.md`). Stale data
shows its age.

## Exit state
Roger can answer the charter's five questions; every off-target metric has either an
action taken or a decision not to act.

## Existing modules reused
`scripts/founder-scoreboard-service.mjs`/`-api.mjs` (21-collection targeted read set,
statuses), `scripts/founder-company-health-service.mjs`/`-api.mjs` (Platform health),
Stripe/signups snapshot fetchers with SWR caching (`preview-server.mjs:12764–12822`),
`scripts/engagement-growth.mjs`, `scripts/operating-loops.mjs` (pulse snapshots),
`scripts/lee-assistant.mjs` (explanations).

## Collections read
The frozen `FOUNDER_SCOREBOARD_READ_COLLECTIONS` + `FOUNDER_COMPANY_HEALTH_READ_COLLECTIONS`
sets (campaigns, connectorStatus, funnelSnapshots, heartbeatRuns, osHealthSnapshots,
outreach*, partners, pilots, prospectCandidates, runwayInputs, sendgridWebhookHealth,
socialAccounts, supportIssues, tasks, systemHealth, …).

## Collections written
`runwayInputs` (owner finance input) only.

## External providers involved
Stripe, signups/analytics endpoints (read-only snapshots); none mutated.

## Safety gates
Targeted reads only (performance rule); authenticated + `read_internal`; owner-only
finance input; no fabricated values (status machinery).

## Non-goals
Turning Scoreboard back into a report archive; inline fixing (fixes happen in their
workspace via the corrective link); exposing engine internals as "health".
