# 07 — Migration and Deprecation Ledger

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

Every existing page, route, button, and major component carries exactly one status:

- **Keep** — remains, possibly relabeled, as part of the product
- **Consolidate** — merges into a four-workspace surface; route aliases preserved
- **Contextualize** — no longer a destination; appears inside the context that needs it
- **Advanced only** — visible only under Settings → Advanced
- **Hide now** — removed from visible UI immediately (Release 1); code untouched
- **Deprecate after parity** — visible until its replacement passes the release's parity requirement, then retired
- **Remove** — deleted (each removal in its own future PR, never this one)

Sources: `evidence/route-inventory.md` (all 75 routes + 53 aliases) and
`evidence/loose-ends.md` (buttons/stubs). The route→target mapping detail lives in
`02_TARGET_PRODUCT_AND_IA.md`; this ledger assigns fates.

## Pages / routes (all 75)

| Status | Routes |
|---|---|
| **Keep** | `today` (becomes the Today queue), `partners` (becomes Relationships), `campaigns` (reused inside Campaigns Reactivation), `settings`, `queue` (Review Desk → Social Review stage), `growth` (→ Campaigns Social), `os-health` (→ Scoreboard Platform health), `revenue`/`proof`/`metrics` (→ Scoreboard) |
| **Consolidate** | `cockpit`, `overview`, `daily-run`, `focus`, `tasks-today`, `tasks-this-week`, `morning-brief`, `evening-reflection`, `daily-closeout`, `milestones` → Today · `partner-hub`, `partner-programs`, `partner-pages`, `partner-dashboards`, `partner-reports`, `partner-proposals`, `pages`, `pilots`, `contacts`, `prospects` (records) → Relationships · `upload`, `production`, `production-linkedin-queue`, `production-twitter-x-queue`, `content-bank`, `sources`, `posted` → Campaigns · `funnel` → Scoreboard Acquisition · `operator-search` → global Search · `lee` → Le-E panel |
| **Contextualize** | `meetings` (→ Today Meetings), `support` (→ Today Needs attention + secondary queue), `alerts` (→ Today Needs attention), `automation` (→ Today Needs attention), `decisions` (→ contextual approvals), `growth-inbox` (→ Today Communications), `capture-inbox` (→ global Create + Today), `tasks`/`tasks-blocked`/`tasks-waiting` (→ Today secondary views), `reports`, `dataroom`, `evidence-room`, `assets`, `compliance`, `soc2-evidence`, `soc2-policies` (→ Files in context + Search) |
| **Advanced only** | `autonomy`, `data-integrity`, `smoke-test`, `safe-mode`, `handoff-contract`, `conversation-notes`, `operating-memory`, `soc2`, `soc2-access`, `soc2-audit`, `soc2-changes`, `soc2-vendors`, `soc2-incidents`, `production-activation-rcap` |
| **Keep (Settings)** | `operator-manual`, `roles` |
| **Deprecate after parity** | `more` (shell dispersed by the map), `item` (Artifact Viewer — secondary "Advanced full record" link remains; the destination page retires when the universal panel covers it) |

No route is **Remove** in this package: aliases and canonical routes keep resolving
until parity retires them (charter: old links preserved).

## Major components

| Component | Status | Notes |
|---|---|---|
| Task workbench drawer | Keep | Becomes the universal action panel (reuse ledger row 2) |
| Communication composer | Keep | Exposed consistently in Today + Relationships |
| Social post composer + channel variants | Keep | Campaigns Social |
| Social live-publishing pipeline (OAuth, scheduled publisher, Publish Now) | Advanced only | Dormant behind env gates; publish-now gate gap must be fixed before any activation (`evidence/publish-now-gate-review.md`) |
| Reactivation engine | Keep | Unchanged; new surface calls existing functions |
| Partner outreach engine | Keep | Unchanged |
| Prospect discovery (B5) | Keep | Feeds the ranked list; flag stays server-side |
| Automation Control Center | Deprecate after parity | Read models reused inside Campaigns (Release 4) |
| Campaign command controls | Keep | Reused behind the simplified Reactivation surface |
| Le-E assistant + Le-E inbox | Keep | Becomes the global side panel (Release 6) |
| Founder Scoreboard / Company Health services | Keep | Scoreboard workspace |
| Heartbeat + engines | Keep (invisible) | Never product |
| Inbox intelligence I1–I4 | Keep | Signal source for Today Communications |
| Meeting briefs + founder calendar | Keep | Today Meetings |
| Support desk | Keep | Today Needs attention + secondary queue |
| Company memory projector | Keep | Data spine for projections |
| Upstash auth store / Supabase store / targeted reads | Keep | Infrastructure |
| Artifact viewer | Contextualize | Secondary "Advanced full record" only |
| RCAP revenue OS / production activation | Advanced only | Until RCAP is a product decision |
| `social-clean/` directory | **Remove** | Untracked stale repo clone, referenced by nothing — `evidence/parallel-implementations.md`. Removal (delete directory + drop `.gitignore:59`) executed in a **separate future PR/cleanup**, never this documentation PR |

## Loose-ends table

Seeded from the outline, verified against `evidence/loose-ends.md`:

| Item | Current behavior | User risk | Immediate treatment | Final treatment |
|---|---|---|---|---|
| Cockpit "Mark Done" (`preview-server.mjs:24143`, `:24171`) | Toast only, no mutation | False belief work was completed | **Hide now** | Replace with task-workbench action (real `POST /api/tasks/:id/done`) |
| Cockpit "Edit Priority" (`:24141`) | Toast only, no mutation | Same false-completion belief | **Hide now** | Replace with task-workbench action |
| Cockpit "Move to Tomorrow" (`:24144`, `:24192`) | Toast or bare navigation | Same | **Hide now** | Replace with task-workbench snooze/reschedule |
| Guided-queue judgment-mode "Mark waiting"/"Mark done" (`:20034–20036`) | Toast only in this mode | Same | **Hide now** (this mode's fake actions) | Wire to real task actions |
| "Resolve Blocker" (`:24190`) | Toast only | Same | **Hide now** | Replace with real blocked→resolve transition |
| SendGrid Test (`:25612`, `:25628`) | Says "not wired in this pass" | Confusion about email readiness | **Remove from normal UI** | Restore under Settings only when a real test-send exists |
| RCAP connection (`:20904–20929`, `:34918`) | Opens placeholder details; dead end | Dead end masquerading as setup | **Advanced only** | Wire or retire |
| Review-only imports (`consumer-list-import.mjs`, `expungement-lifecycle-sync.mjs`) | Create held review records only (deliberate safety) | Appears operational end-to-end | **Label clearly** ("Imported contacts are held for review; nothing sends") | Connect (audience staging in Campaigns) or remove |
| Wilma generation (`:3777–3904`) | Local SVG placeholder stored as generated image | Looks like provider output | **Defer from core product**; keep the existing "Local placeholder only" label prominent | Optional future integration |
| Non-persistent folder creation | Already fixed: `Create folder` renders disabled with honest deferral copy (`scripts/ui/global-create.mjs:169`) | None remaining | Keep the honest disabled state | Real folders only if Files ever needs them |
| Unconnected revenue/signup metrics | Already fixed: live connectors + honest "Not wired yet" empty states (`preview-server.mjs:12764–12822`) | None remaining if labels stay honest | Keep honest labels | Connect remaining sources in the Scoreboard release |
| `social-clean/` | Untracked stale full clone, nothing references it | Editing the wrong copy; stale safety code mistaken for current | Do not touch in this PR | **Remove** in a separate future PR (`evidence/parallel-implementations.md`) |

## The rule

**"No visible button may remain if it cannot complete the action its label promises."**
