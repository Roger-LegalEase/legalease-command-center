# Workflow 12 — Handle a platform incident

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
Understand what broke, protect customers and campaigns, and get back to healthy — with a
record of what happened.

## Trigger
A platform-health exception (app/database/auth/provider failure, webhook health
degraded, heartbeat failures, campaign safety trip) surfaces in Today → Needs attention.

## Entry points
Today → Needs attention (the incident item, in plain language); Scoreboard → Platform
health (full diagnostics); alert email (owner-locked, if enabled).

## Context required
What is affected in founder terms ("Delivery feedback disconnected — bounce data is
stale; sending is paused"), since when, current blast radius (which campaigns/surfaces),
and the one or two available actions.

## Primary action
Open the incident item → read the plain-language summary → take the contained action
(stop an affected campaign; acknowledge and monitor; open the Advanced diagnostic when
needed) → record the incident outcome (resolution note) → the item clears when the
underlying signal recovers.

## Secondary actions
Open Scoreboard Platform health detail; open Settings → Advanced (self-check,
data-integrity, safe mode) when hands-on recovery is required; create a follow-up task;
add to the incident register.

## Automatic side effects
Campaign safety machinery acts on its own (threshold auto-pause, fail-closed sends,
claims) — the incident view reports it, never re-implements it. Health snapshots keep
recording; resolution stamps the register.

## Confirmation policy
Stop actions are immediate and unconfirmed (stopping is always safe). Anything
destructive or recovery-mode (safe mode, data repair) stays in Advanced with its
existing confirmations.

## Failure behavior
If the incident affects the Command Center itself, the existing safe-mode and
self-check surfaces remain reachable (Advanced); the product never hides a broken state
behind a healthy-looking page — statuses go Needs attention/Unavailable honestly.

## Exit state
Incident acknowledged, contained, resolved, and recorded; Today is quiet again;
anything requiring engineering has a task.

## Existing modules reused
`scripts/os-health.mjs` (snapshots), `scripts/founder-company-health-service.mjs`,
`scripts/sendgrid-webhook.mjs` (webhook health), `buildAlertsEngine` + owner-locked
alert email dispatcher (`preview-server.mjs:5513–5518`), `scripts/smoke-test-center.mjs`,
`scripts/state-integrity.mjs`, safe-mode surface, `soc2Incidents` register.

## Collections read
`osHealthSnapshots`, `systemHealth`, `sendgridWebhookHealth`, `heartbeatRuns`,
`connectorStatus`, `alerts`, `reactivationCampaign` (trip state), `soc2Incidents`.

## Collections written
`alerts` (acknowledge), `soc2Incidents` (register entry), `tasks`, `auditHistory`,
`queueItems` (clear).

## External providers involved
None directly; provider health is observed via existing signals. Alert email via
SendGrid to the owner-locked recipient only.

## Safety gates
Alert recipient hard-locked to owner; campaign auto-pause independent of this surface;
prod deploys stay manual (`render.yaml` autoDeploy false + prod commit gate) — an
incident never triggers an automatic deploy.

## Non-goals
Auto-remediation; restarting services from the founder surface; exposing raw logs as
the primary interface (logs stay in Advanced).
