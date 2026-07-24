# 02 — Target Product and Information Architecture

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

This document describes **what Roger sees**, not how the repository is organized. Route
facts come from `evidence/route-inventory.md` (75 canonical routes, 53 aliases at
`a3793c3`).

## Primary navigation

```text
Today
Relationships
Campaigns
Scoreboard
```

## Global controls

```text
Search
Create
Le-E
Settings
```

Nothing else is primary. Inbox, Support, Calendar, Files, and Company Health are
capabilities that surface inside the four workspaces.

## Secondary views

Exactly these, and no others without a charter update:

| Workspace | Secondary views |
|---|---|
| Today | Communications · Meetings · Support · Needs attention |
| Relationships | All relationships · Follow-up due · Waiting on me · Waiting on them · Pipeline · Suppressed |
| Campaigns | Social · Reactivation · Partner outreach · Press outreach |
| Scoreboard | Financial · Acquisition · Pipeline · Customer · Marketing · Platform health |

## Route map — every current route to its target home

Every one of the 75 canonical routes at current HEAD is mapped below. Treatments marked
DECIDED come from the consolidation outline; treatments marked PROPOSED are additions for
routes the outline does not name, for Roger to ratify. The registry's historical vNext
classification (13 destinations) is superseded by this map wherever they differ.

**Old links are preserved until each replacement reaches parity.** No route or alias is
removed in this package; the 53 existing aliases keep resolving, and each canonical route
keeps rendering until `08_DELIVERY_PLAN.md` parity requirements retire it.

### Today

| Current route (label) | Target | Treatment | Status |
|---|---|---|---|
| `today` (Today) | Today | Keep and simplify — becomes the ordered work queue (Now / Next / Communications / Meetings / Needs attention) | DECIDED |
| `cockpit` (Cockpit) | Today | Keep and simplify; toast-only standup buttons replaced per `07_MIGRATION_AND_DEPRECATION_LEDGER.md` | DECIDED |
| `overview` (Overview) | Today | Fold into Today; retire after parity | DECIDED |
| `daily-run` (Daily Run) | Today | Fold into Today's queue | DECIDED |
| `focus` (Focus) | Today | Fold into Today's Now/Next ranking | DECIDED |
| `tasks-today` (Tasks Today) | Today | Fold into Today's queue | DECIDED |
| `tasks-this-week` (This Week Tasks) | Today | Fold into Today (Next + resurfacing rules) | DECIDED |
| `morning-brief` (Morning Brief) | Today | Becomes Le-E's morning brief inside Today's first-15-minutes view | DECIDED |
| `evening-reflection` (Evening Reflection) | Today | Fold into Today's close-of-day flow | PROPOSED |
| `daily-closeout` (Daily Closeout) | Today | Fold into Today's close-of-day flow | PROPOSED |
| `capture-inbox` (Capture Inbox) | Today + global Create | Quick capture moves to the global Create control; triage of captured items lands in Today | PROPOSED |
| `tasks` (Tasks) | Today (full task list as secondary view) | Task list becomes a secondary view behind Today; the universal action panel is the way tasks are worked | DECIDED |
| `tasks-blocked` (Blocked Tasks) | Today — blocked items resurface per `workspaces/today.md` | Fold into Today's waiting/blocked resurfacing | DECIDED |
| `tasks-waiting` (Waiting Tasks) | Today — waiting items resurface per `workspaces/today.md` | Fold into Today's waiting/blocked resurfacing | DECIDED |
| `growth-inbox` (Growth Inbox — campaign replies) | Today Communications (and Campaigns Monitor view of the same data) | Inbox-to-Today-Communications treatment: full reply queue remains as a secondary view | DECIDED |
| `support` (Support) | Today Needs attention; full support queue as secondary view | Support-to-Today treatment | DECIDED |
| `alerts` (Alerts) | Today Needs attention | Alerts are exceptions; they qualify for Today, not a page | PROPOSED |
| `automation` (Automation Inbox) | Today Needs attention | Automation-Inbox-to-Today treatment; exceptions only | DECIDED |
| `meetings` (Meetings; aliases `calendar`, `meeting`, `meeting-prep`) | Today Meetings | Calendar-to-Today-Meetings treatment; full weekly calendar opens on demand | DECIDED |
| `decisions` (Decisions) | Contextual approvals — inside the item being approved | Removed from primary navigation; approvals appear where the work is (Today panel, Campaigns Review) | DECIDED |
| `milestones` (Milestones) | Today (three most important outcomes) with progress visible in Scoreboard | Fold in; no standalone page | PROPOSED |
| `operating-memory` (Operating Memory) | Settings → Advanced | Internal machinery; charter explicitly removes it from navigation | DECIDED |

### Relationships

| Current route (label) | Target | Treatment | Status |
|---|---|---|---|
| `partners` (Partners) | Relationships | Renamed and consolidated into Relationships; the Partner system supplies the CRM foundation | DECIDED |
| `partner-hub` (Partner Hub) | Relationships | Consolidate | DECIDED |
| `partner-programs` (Partner Programs) | Relationships (organization records) | Consolidate | DECIDED |
| `partner-pages` (Partner Pages) | Relationships (organization record → Files context) | Consolidate; page artifacts live on the relationship | DECIDED |
| `partner-dashboards` (Partner Dashboards) | Relationships (organization record) | Consolidate | DECIDED |
| `partner-reports` (Partner Reports) | Relationships (organization record → Files context) | Consolidate | DECIDED |
| `partner-proposals` (Partner Proposals) | Relationships (Pipeline view) | Consolidate | DECIDED |
| `pages` (Pages — co-branded page review) | Relationships (organization record) | Consolidate; review actions from the relationship | PROPOSED |
| `pilots` (Pilots) | Relationships (Pipeline view) | Consolidate | PROPOSED |
| `contacts` (Contacts; aliases `lists`, `people`) | Relationships | Contact lists project into the unified CRM table | DECIDED |
| `prospects` (Prospects) | Relationships (Pipeline) for records; Campaigns Partner outreach for the ranked outreach flow | Split by function: identity lives in the CRM, outreach operation lives in Campaigns | PROPOSED |

### Campaigns

| Current route (label) | Target | Treatment | Status |
|---|---|---|---|
| `campaigns` (Campaigns — campaign command) | Campaigns Reactivation | Reused internally behind the simplified Reactivation control surface; real controls unchanged | DECIDED |
| `upload` (Upload List; aliases `import` …) | Campaigns (audience import step) | Outreach-into-Campaigns treatment; review-only labeling per migration ledger | DECIDED |
| `growth` (Growth; aliases `social`, `marketing`, `posts` …) | Campaigns Social | Social-into-Campaigns treatment | DECIDED |
| `queue` (Review Desk) | Campaigns Social (Review stage) | The social Review Desk becomes the Review step of the Social lane; gates untouched | DECIDED |
| `production` (Production) | Campaigns Social | Consolidate into the Social lane | DECIDED |
| `production-linkedin-queue` (LinkedIn Approval Queue) | Campaigns Social (Review, filtered by channel) | Consolidate | DECIDED |
| `production-twitter-x-queue` (X Approval Queue) | Campaigns Social (Review, filtered by channel) | Consolidate | DECIDED |
| `content-bank` (Content Bank) | Campaigns Social (Plan stage) | Consolidate | DECIDED |
| `sources` (Sources) | Campaigns Social (Plan stage inputs) | Consolidate | DECIDED |
| `posted` (Posted) | Campaigns Social (Monitor stage) | Consolidate | DECIDED |
| `funnel` (Funnel) | Scoreboard Acquisition | This is acquisition-funnel measurement, not campaign operation | PROPOSED |

Press outreach has **no existing route**: no press code exists in main at current HEAD
(see `01_CURRENT_STATE_REUSE_LEDGER.md`). The Press lane in Campaigns is NEW scope,
defined in `workflows/10-run-press-outreach.md`.

### Scoreboard

| Current route (label) | Target | Treatment | Status |
|---|---|---|---|
| `revenue` (Revenue; aliases `money`, `payments`, `stripe`) | Scoreboard Financial | Financial metrics belong on the Scoreboard | PROPOSED |
| `proof` (Proof; aliases `metrics`, `kpis`) | Scoreboard | The KPI/proof page is the Scoreboard's ancestor; consolidate (registry's historical "Files" tag superseded) | PROPOSED |
| `metrics` (Metrics) | Scoreboard | Consolidate | PROPOSED |
| `os-health` (App Status; aliases `health`, `system`) | Scoreboard Platform health | Company-Health-to-Scoreboard treatment | DECIDED |

### Files — contextual + Search

| Current route (label) | Target | Treatment | Status |
|---|---|---|---|
| `reports` (Reports) | Files, contextual + Search | Files treatment: surfaced from the related relationship/campaign/meeting; global Search finds everything | DECIDED |
| `dataroom` (Data Room) | Files, contextual + Search | Same | DECIDED |
| `evidence-room` (Evidence Room) | Files, contextual + Search | Same | DECIDED |
| `assets` (Assets) | Files, contextual + Search (brand assets also surface inside Campaigns Social) | Same | DECIDED |
| `compliance` (Compliance) | Files, contextual + Search | Same | PROPOSED |
| `soc2-evidence` (Evidence Center) | Files, contextual + Search | Same | PROPOSED |
| `soc2-policies` (Policies) | Files, contextual + Search | Same | PROPOSED |

### Settings and Advanced

| Current route (label) | Target | Treatment | Status |
|---|---|---|---|
| `settings` (Settings; alias `privacy`) | Settings (global control) | Keep | DECIDED |
| `operator-manual` (Guide) | Settings | Keep as reference under Settings | PROPOSED |
| `roles` (Team Roles) | Settings | Keep | PROPOSED |
| `autonomy` (Autonomy) | Settings → Advanced | Gates/engines treatment: internal machinery | DECIDED |
| `data-integrity` (Data Integrity) | Settings → Advanced | Same | DECIDED |
| `smoke-test` (Self-Check) | Settings → Advanced | Same | DECIDED |
| `safe-mode` (Safe Mode; alias `recovery`) | Settings → Advanced | Same | DECIDED |
| `handoff-contract` (Handoff Contract) | Settings → Advanced | Same | DECIDED |
| `conversation-notes` (Conversation Notes) | Settings → Advanced | Same | DECIDED |
| `soc2` (SOC 2 Readiness) | Settings → Advanced | Same | PROPOSED |
| `soc2-access` (Access Reviews) | Settings → Advanced | Same | PROPOSED |
| `soc2-audit` (Audit Logs) | Settings → Advanced | Logs treatment: never primary | DECIDED |
| `soc2-changes` (Change Management) | Settings → Advanced | Same | PROPOSED |
| `soc2-vendors` (Vendor Inventory) | Settings → Advanced | Same | PROPOSED |
| `soc2-incidents` (Incident Register) | Settings → Advanced; active incidents surface in Today Needs attention | Same | PROPOSED |
| `production-activation-rcap` (RCAP Program Review; alias `rcap`) | Settings → Advanced (hidden until functional) | RCAP placeholder treatment per reuse ledger | DECIDED |

### Global controls and retired shells

| Current route (label) | Target | Treatment | Status |
|---|---|---|---|
| `lee` (Le-E; alias `le-e`) | Le-E global side panel | The page retires after the panel reaches parity; propose-only mechanics unchanged | DECIDED |
| `operator-search` (Operator Search) | Search (global control) | Consolidate | DECIDED |
| `item` (Artifact Viewer) | Secondary only — "Advanced full record" behind the universal action panel | Artifact-viewer treatment; never a primary destination | DECIDED |
| `more` (More) | Removed — its contents are dispersed by this map | Deprecate after parity | DECIDED |

## Where each contextual capability lives

- **Inbox** — inside Today Communications and Relationships timelines; the full inbox
  queue is a secondary filter of Communications, not a destination.
- **Calendar** — Today Meetings; the relationship record shows related meetings; a full
  weekly calendar opens on demand.
- **Support** — urgent/waiting items in Today Needs attention; full queue secondary.
- **Files** — in the context of the related relationship, campaign, support issue, or
  meeting; global Search finds everything.
- **Company Health** — exceptions in Today Needs attention; full diagnostics in
  Scoreboard Platform health.

## Rules this map enforces

1. No ambiguity: every existing route above has exactly one target home.
2. Old links are preserved until each replacement reaches parity (per-release parity
   requirements in `08_DELIVERY_PLAN.md`).
3. No new standalone page may be introduced unless the product authority
   (`00_READ_ME_FIRST.md`) is updated first.
