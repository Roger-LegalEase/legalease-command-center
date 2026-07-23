# 08 — Delivery Plan

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

Six vertical, outcome-based releases. Every release ships end-to-end founder value,
reuses the components named in `01_CURRENT_STATE_REUSE_LEDGER.md`, and hides no old
route before its parity requirement passes.

## Preconditions before Release 1 (documented here, NOT performed by this PR)

Two separate future PRs are required before Release 1 implementation begins. This
package only records them.

### Precondition A — audit-fixes PR
1. **Publish Now live gate** — `evidence/publish-now-gate-review.md` confirms the gap is
   **still open** at `a3793c3`: `publishPostNow` (`scripts/preview-server.mjs:5801`)
   never calls `livePostingEnabledForChannel`. Fix: enforce the same gate the scheduled
   worker enforces (`:5625`), with a test.
2. **sharp upgrade** — `package.json:182` still pins `sharp: ^0.34.5`;
   `evidence/inspection-bundle-e620bde/07-dependency-audit.txt` records libvips CVEs
   (CVE-2026-33327/-33328/-35590/-35591) fixed only in the breaking `sharp@0.35.3`.
   Upgrade and re-run the render pipeline tests.
3. **PII containment** — enforce the privacy rule (`05_DATA_AND_INTEGRATION_CONTRACT.md`):
   suppression exports and contact spreadsheets in gitignored private storage only; sweep
   the repo root of any remaining contact/suppression files and add ignore rules.
4. **Node pinning** — `package.json` has no `engines` field; pin the Node major used in
   production (Render) so local, CI, and prod agree.

### Precondition B — social-clean/ removal PR
Delete the untracked stale clone `social-clean/` and drop `.gitignore:59`. Evidence:
`evidence/parallel-implementations.md` (unreferenced, ~2 weeks stale, duplicates all
engines including a `publishPostNow` **without** the claim machinery). Recorded as a PR
requirement even though the directory is untracked, so the removal is reviewed and
deliberate.

---

## Release 1 — Simplified shell
Four workspaces in primary navigation; existing routes preserved; internal destinations
out of primary navigation; Advanced section created.

- **Reused:** the entire existing route registry and renderers; `scripts/ui/navigation.mjs`.
- **Routes superseded:** none — navigation changes only; all 75 routes + 53 aliases keep resolving.
- **Projection/adapter:** navigation shell mapping (`02_TARGET_PRODUCT_AND_IA.md`); Advanced section under Settings.
- **Data migration:** none.
- **Feature flag:** `FOUNDER_OS_SHELL` (new), default off until sign-off.
- **Rollback:** flag off → current 6-item navigation returns.
- **Parity before hiding:** every "Hide now" item in `07_MIGRATION_AND_DEPRECATION_LEDGER.md` is hidden (toast-only cockpit buttons, SendGrid Test, RCAP placeholder to Advanced); nothing else hides.
- **Acceptance scenarios:** Roger opens the app and sees Today/Relationships/Campaigns/Scoreboard + Search/Create/Le-E/Settings and nothing else in primary nav; every old bookmark still lands somewhere sensible; no button remains that lies about completing work; Advanced contains the machinery pages.

## Release 2 — Today operating loop
Ordered queue; Communications; Meetings; Needs attention; universal action panel;
end-to-end follow-up completion.

- **Reused:** task workbench drawer (becomes the panel), tasks engine, communication composer + mark-sent cascade, inbox intelligence signals, meeting briefs, support desk, alerts, queueItems model.
- **Routes superseded:** `cockpit`, `overview`, `daily-run`, `focus`, `tasks-today`, `morning-brief` (alias into Today after parity).
- **Projection/adapter:** Today ranking projection (`workspaces/today.md` rules) over existing collections; panel adapter extending task-workbench actions to emails/approvals/support.
- **Data migration:** none — projections only.
- **Feature flag:** `FOUNDER_OS_TODAY`.
- **Rollback:** flag off → legacy today/cockpit pages.
- **Parity before hiding:** workflow 01's ten-step chain passes end-to-end (draft → Gmail → mark sent → task done → last-contact updated → automation flagged → next follow-up → item gone); panel covers every action the retired pages offered.
- **Acceptance scenarios:** Roger clears a real follow-up without leaving the panel and every related record updates; a commitment due today appears ranked and resolves through workflow 02; an urgent support issue surfaces and is triaged in place; completing the last Now item promotes the next.

## Release 3 — Relationship consolidation
Unified identity projection; unified timeline; CRM filters; follow-up and commitment
workflow.

- **Reused:** partner records + routes (foundation), company-memory identity model, relationship-service categories, composer, prospect/outreach/reactivation contact lanes (read-projected).
- **Routes superseded:** `partners`, `partner-hub`, `partner-*` detail pages, `contacts`, `pages`, `pilots` (alias into Relationships after parity).
- **Projection/adapter:** identity dedup projection (email/domain keyed, ambiguity surfaced); unified timeline composer.
- **Data migration:** **none destructive** — projection over the seven identity stores; ratified merges write links, never delete lane records.
- **Feature flag:** `FOUNDER_OS_RELATIONSHIPS`.
- **Rollback:** flag off → partners pages; projections are read-side, so no data risk.
- **Parity before hiding:** every partner-page action exists on the unified record (scoped-write tests pass); saved filters return correct sets on real data; timeline shows all ten source types.
- **Acceptance scenarios:** a person who is both investor and partner contact appears once with both roles; "Waiting on me" returns exactly the relationships whose last inbound is unanswered; workflow 05 advances a real opportunity and Scoreboard pipeline reflects it without re-entry.

## Release 4 — Campaign consolidation
Social weekly planner; Reactivation control; Partner outreach; Press outreach; common
lifecycle.

- **Reused:** weekly planner service, post composer + variants, Review Desk + gates, campaign command controls, reactivation + outreach engines untouched, automation-control read models, prospect discovery.
- **Routes superseded:** `growth`, `production`, `production-*-queue`, `content-bank`, `sources`, `posted`, `queue`, `campaigns`, `upload`, `automation` (alias after parity).
- **Projection/adapter:** lifecycle framing (Plan/Review/Run/Monitor/Stop) + the translation table (`workspaces/campaigns.md`) over existing routes; Press lane **NEW** (collections registered per `05`; approved-claims gate).
- **Data migration:** none for existing lanes; press-lane collections are new registrations.
- **Feature flag:** `FOUNDER_OS_CAMPAIGNS` (press sub-flag `FOUNDER_OS_PRESS`).
- **Rollback:** flags off → existing pages; engines never depended on the new surface.
- **Parity before hiding:** all gate tests pass through the new surface (relocation invariant, `06_SAFETY_AND_AUTOMATION_CONTRACT.md`); every campaign-command control is reachable; the Social weekly session produces approved exports end-to-end; **no Publish Now affordance without the live gate (Precondition A closed)**.
- **Acceptance scenarios:** Roger runs workflow 08 (release a wave, see the exact blocked-reason, stop and resume) without meeting an engine term; workflow 07 yields a week of platform-distinct approved posts; a partner-outreach reply stops its sequence and lands in Today.

## Release 5 — Scoreboard
KPI registry; trusted sources; manual inputs; Company Health integration;
corrective-action links.

- **Reused:** founder scoreboard service + statuses, company health service, Stripe/signups snapshot fetchers, runwayInputs, funnel snapshots, pulse snapshots.
- **Routes superseded:** `proof`, `metrics`, `revenue`, `os-health`, `funnel` (alias after parity).
- **Projection/adapter:** KPI registry per `workspaces/scoreboard.md` (per-metric contract incl. targets, variance, corrective links).
- **Data migration:** none; targets stored in `settings`/`runwayInputs` (existing singletons).
- **Feature flag:** `FOUNDER_OS_SCOREBOARD`.
- **Rollback:** flag off → legacy metric pages.
- **Parity before hiding:** every number the legacy pages showed exists on the Scoreboard with an honest status label; no fake zeroes (assert Unavailable states); Platform health shows all nine components.
- **Acceptance scenarios:** disconnected analytics shows Unavailable, not 0; Stripe revenue is labeled revenue-collected, and cash shows Manual with its as-of date; a Needs-attention metric links Roger to the exact fixing surface (workflow 11).

## Release 6 — Le-E contextual operation
Cross-workspace panel; commitment detection; drafting; meeting preparation; internal
actions; daily brief.

- **Reused:** lee-assistant (propose-only), lee-inbox service, automationSuggestions I4 apply flow, inbox intelligence, meeting briefs, morning brief.
- **Routes superseded:** `lee` page (panel replaces it after parity).
- **Projection/adapter:** side-panel host in the shell; context injection per workspace. **NEW:** the no-confirmation internal-action list (create task, add note, set next action, change due date, mark waiting, update stage, record manual email) executes through an extended I4 apply path — same approval semantics relaxed *only* for the enumerated internal actions; the one-confirmation external list is unchanged.
- **Data migration:** none.
- **Feature flag:** `FOUNDER_OS_LEE_PANEL`.
- **Rollback:** flag off → `#lee` page; proposals remain in `automationSuggestions` either way.
- **Parity before hiding:** panel reaches every capability of the page; gate tests still pass (Le-E can never send, publish, release, or unsuppress without the one confirmation).
- **Acceptance scenarios:** from a Relationships record, Le-E drafts a follow-up with real context; the morning brief answers the charter's five questions; Le-E creates a task without a prompt but requires exactly one confirmation to draft-for-send an external email; "what am I forgetting" surfaces a real quiet thread.

---

## Final acceptance standard

The consolidation is done when Roger can truthfully say:

- I understand what matters within five minutes.
- I complete work without navigating multiple pages.
- I can manage my follow-ups in one session.
- I operate campaigns through clear controls.
- I run LegalEase in under four focused hours per day.
