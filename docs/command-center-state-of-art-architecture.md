# LegalEase Command Center — State-of-the-Art Architecture Blueprint

_Written 2026-07-02. Companion to `docs/command-center-ground-truth-audit.md` (current-state facts) and `legalease-command-center-brain-nerve-center-build-plan.md` (product brief). This is the target architecture, grounded in the actual repo._

**Status marks used throughout:**
- **Existing** — in the repo today, working
- **Partial** — some of it exists; gaps named
- **Missing** — does not exist
- **Recommended** — proposed design, build when its phase arrives
- **Do not build yet** — deliberately deferred; prerequisite named

---

## 1. North-star product vision

One calm, plain-English command surface where Roger runs LegalEase — Expungement.ai, RCAP, partners, support, revenue, campaigns, inbox, meetings, proof, production health, and agent work — without leaving the Command Center and without a terminal.

The system always answers eight questions: What changed? What matters? What needs Roger? What did the system already handle? What is blocked? What should happen next? What is safe to automate? What requires approval?

The existing repo is already most of the machinery (custom Node server, ~60 domain modules, Supabase persistence, heartbeat engines, gated send pipelines, approval surfaces). The architecture work is **organizing that machinery into one control plane** — not rebuilding it.

## 2. Control-plane architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Today at LegalEase (UI)                   │
│   Needs Roger · Watchlist · Money · People stuck · Health    │
└──────────────┬───────────────────────────────┬──────────────┘
               │ reads                         │ approvals
┌──────────────▼──────────────┐  ┌─────────────▼──────────────┐
│        Unified Queue        │  │      Policy & Approval      │
│  (one work surface, plain-  │  │  (allowed / needs-approval  │
│   English items + statuses) │  │   / blocked + audit log)    │
└──────────────┬──────────────┘  └─────────────┬──────────────┘
               │ written by                    │ gates
┌──────────────▼───────────────────────────────▼──────────────┐
│                  Engines (heartbeat plan/act)                 │
│  monitors (B3/B4/B7) · drafters · sequencers (B1/B2/B5)      │
└──────────────┬───────────────────────────────┬──────────────┘
               │ normalize into                │ durable actions via
┌──────────────▼──────────────┐  ┌─────────────▼──────────────┐
│   Events + Entity graph      │  │   Outbox / jobs (Phase 14) │
│  (Contacts, Orgs, Events,    │  │  lease · retry · dead-letter│
│   Agent Runs, Approvals)     │  │                             │
└──────────────┬──────────────┘  └─────────────┬──────────────┘
               │ fed by                        │ executes through
┌──────────────▼───────────────────────────────▼──────────────┐
│                       Source adapters                        │
│ Supabase · SendGrid · Stripe · Gmail/Calendar · GitHub ·     │
│ Render · Expungement.ai events · uploads · social · support  │
└──────────────────────────────────────────────────────────────┘
```

**Key principle:** extend the existing heartbeat plan/act backbone (Existing, `scripts/heartbeat.mjs`) — do not replace it. New layers (Queue, entity graph, outbox) are additive collections + adapter modules that existing engines write into.

## 3. Source adapter layer

Adapters normalize each external source into internal objects (Events, entity patches, metric snapshots) so the UI never understands integrations directly.

| Adapter | Status | Repo reality |
|---|---|---|
| Supabase (state store) | **Existing** | `scripts/storage.mjs` `SupabaseCoreStore`, `leos_core_records` |
| SendGrid events (push) | **Partial** | webhook route exists (`preview-server.mjs` `/api/outreach/webhooks/sendgrid`) but no signature verification, no health telemetry, full-state write (fragile). Phase 0 fixes this. |
| SendGrid backfill (pull) | **Existing** | `reactivation-backfill-sendgrid-bounces.mjs` (suppressions API) |
| Stripe | **Partial** | revenue snapshot fetcher wired to Revenue box + B4; no failed-payment/refund/anomaly loop |
| Gmail / Calendar | **Existing (read-only)** | `google-workspace.mjs`, read-only scopes by design |
| Expungement.ai lifecycle | **Partial** | ingest endpoints exist (`expungement-lifecycle-sync.mjs`); **no live source pull** — needs an export bridge on the product side |
| Product events | **Existing** | `/api/events/product` HMAC-verified webhook |
| Uploads (CSV/XLSX) | **Partial** | consumer list wired; rcap_prospect / social_calendar / support types stubbed |
| GitHub / Render (deploy truth) | **Missing** | `/api/version` reports the running commit; nothing compares it to main or Render deploy state. **Recommended** Phase 0/1: a version-truth check (see §10) |
| Social platforms | **Partial** | OAuth built (LinkedIn most complete); posting gated OFF by invariant |
| Support intake | **Missing** | `supportIssues` collection exists but no intake source (B8 planned) |

**Adapter contract (Recommended):** each adapter is a module exporting `fetchX()` (read) and/or a webhook reducer (push) that returns normalized `{ events: [], patches: [], snapshot: {} }` — never writes state directly; the caller merges via scoped writes.

## 4. Event model

**Existing (siloed):** `events`, `activityEvents`, `reactivationEvents`, `rcapRevenueEvents`, `expungementLifecycleEvents`, `outreachReplies/Bounces/Unsubscribes`, `heartbeatRuns`. Each domain keeps its own ledger — good for isolation, bad for a timeline.

**Recommended (Phase 1):** a normalized `companyEvents` collection as a *projection* (the domain ledgers stay the source of truth; a small projector engine appends normalized copies). Schema:

```
{ id, source, type, occurred_at, created_at,
  contact_id?, organization_id?, product?, campaign_id?, payment_id?,
  support_issue_id?, agent_run_id?,
  risk: "info"|"watch"|"needs_roger", confidence: 0..1,
  sensitive: boolean,            // PII flag — summary must be safe if true
  summary,                       // human-readable, plain English, no raw PII
  raw_ref?                       // pointer (collection+item_id), never raw payload
}
```

**Do not build yet:** ingesting screening/checkout funnel events at scale — blocked on the Expungement.ai event bridge; the schema above should be validated with existing sources (SendGrid, Stripe, imports) first.

## 5. Entity graph / company memory

**Existing (siloed) contact stores:** `reactivationContacts`, `outreachContacts`, `rcapRevenueContacts`, `expungementLifecycleContacts` — each with its own dedup key (reactivation uses `contactIdForEmail` sha1 of normalized email — a good precedent).

**Recommended (Phase 1): `companyContacts` as an identity index, not a migration.** One record per person keyed by normalized email (reuse `contactIdForEmail`), holding identity + type tags + `links[]` pointers into the domain collections. Domain collections stay authoritative for their workflow state; the index answers "who is this person across the company?"

```
Contact:      { contact_id, email, name, phone?, types: [consumer|paid|abandoned_screening|
                checkout_abandon|partner_contact|prospect|funder|investor|vendor|attorney|
                support|media|internal], organizations: [org_id], links: [{collection, item_id}],
                first_seen, last_event_at, do_not_contact, sensitive_notes_ref? }
Organization: { org_id, name, domain?, types: [rcap_partner|rcap_prospect|funder|city_county|
                workforce|legal_aid|reentry|advocacy|employer|vendor|investor|media],
                links: [{collection, item_id}], stage?, owner_notes_ref? }
AgentRun:     { run_id, agent, trigger, input_summary, output_summary, confidence,
                actions_proposed, writes_performed, errors, verification, started_at, ended_at }
Approval:     { approval_id, action_type, preview, risk, requested_by, approved_by?,
                approved_at?, executed_at?, verification_result?, queue_item_id }
```

**Existing partial equivalents:** Organizations ≈ `outreachOrganizations` + `rcapRevenueAccounts` + `prospectCandidates` + `partners` (siloed); AgentRun ≈ `heartbeatRuns`/`autonomyRuns`/`leeRuns`/`prospectDiscoveryRuns` (siloed, inconsistent fields); Approval ≈ `approvalQueue` + `autonomyDecisions` (publishing/outreach-centric).

**Hard rule:** the index stores identity + pointers + plain-English summaries only — never raw case/eligibility/criminal-record detail (matches the lifecycle-sync precedent of "operational fields only").

## 6. Unified Queue model

**Existing:** `approvalQueue` (publishing + outreach approval items), `tasks` (tasks-engine), `growthInbox`, `captureInbox`, `rcapRevenueQueueTasks`, `autonomyActions`, `leeActionProposals` — seven queue-like surfaces, each with its own statuses and UI.

**Recommended (Phase 1): one `queueItems` collection** that these feed (adapters convert; existing surfaces become drill-downs — key rule: don't delete pages).

```
{ id, type,                       // see brief's type list
  status: new|needs_roger|drafted|approved|scheduled|done|snoozed|blocked|dismissed,
  title,                          // plain English
  what_happened, why_it_matters, recommendation,
  if_approved,                    // concrete consequence preview
  safety: { level: safe|caution|dangerous, gates: [], fallback },
  risk, source, contact_id?, organization_id?, event_ids?,
  approval_id?,                   // required for any acting item
  snoozed_until?, created_at, updated_at, decided_by?, decided_at? }
```

Every acting queue item must reference an Approval object; approving in the UI writes the Approval and (only at autonomy Level 4) triggers the gated executor.

## 7. Policy & approval engine

**Existing:** de-facto policy scattered across `permissionForRequest` + `canPerformEndpoint` (who may call), env live-gates + autopilot toggles (whether engines act), fail-closed classification routing (B2), structural throws (B5 can't self-approve; compliance assembly throws without postal address), `guardForbiddenEndpoint` kill switch.

**Recommended (Phase 1, thin):** a single `evaluateActionPolicy(action)` module that consolidates the decision — `{ allowed, needs_approval, blocked, approver_role, preview_required, audit_required, post_verification }` — so new executors don't re-invent gate checks. It should *wrap* the existing gates, not replace them. The absolute never-automatic list (sends, deploys, merges, legal rules, packet templates, money, wave releases, gate flips, hold clears, enrollment, sensitive-data exposure) is enforced here as a static deny-list independent of autonomy level.

## 8. Agent control plane

**Existing:** heartbeat engine registry with per-engine autopilot (default OFF), plan/act split, run ledger — this *is* an agent control plane for scheduled agents. Le-E action proposals with approve/reject are a second, interactive one.

**Partial → Recommended:** a declarative `agentRegistry` (per brief: name, purpose, allowed sources, allowed actions, autonomy level, risk class, output schema, approval requirements, failure behavior, last/next run, confidence threshold, safety notes) rendered in the UI, backed by the existing engine ids + `autopilotSettings`. Start as metadata over what exists (B1–B7, Le-E, autonomy-cycle); every agent execution writes an AgentRun.

## 9. Durable outbox / job reliability — **Missing; Do not build yet (Phase 14)**

Design toward: `jobs` collection `{ id, job_type, payload_ref, idempotency_key, status, lease_owner, lease_expires_at, retry_count, last_error, next_retry_at, dead_letter_reason, created_at, updated_at, executed_at }` with a heartbeat-driven worker, manual-retry queue items, and dead-letter alerts.

Precedents already in-repo to generalize: `heartbeatLease` (lease+TTL), `heartbeatRuns` (idempotency buckets), send-time re-checks in both sequencers. Prerequisite before higher autonomy (Level 4 at scale) — but **not** before Phase 0 trust fixes and Phase 1 Queue, which need no new job machinery.

## 10. Observability & trust layer

The system must be able to prove: writes persist, telemetry flows, prod runs what main has, gates are what the UI claims. **This is Phase 0 — the current trust blocker (stale prod deploy breaking full-state writes + webhook) is exactly the failure mode this layer detects in minutes instead of days.**

| Signal | Status | Plan |
|---|---|---|
| Production commit | **Existing** — `/api/version` | UI panel comparing to repo main: **Recommended** (Phase 1 System-health section) |
| Deploy-behind detection | **Missing** | version-truth check: fetch `/api/version` vs local/GitHub main; warn "Production behind" |
| Supabase health | **Existing** — `/api/health/supabase`, `getSupabaseHealth` | surface quietly in Today |
| **Write health** | **Partial** — `lastError` on store, invisible | **Phase 0 patch:** last-success/last-failure/fail-count surfaced via diagnostics + status endpoints |
| **SendGrid webhook health** | **Missing** | **Phase 0 patch:** `webhookHealth` telemetry (lastReceivedAt, verified?, counters by event type, last error) + status-endpoint warnings |
| Webhook signature verification | **Missing** (comment claims it; code has none) | **Phase 0 patch:** ECDSA verify-if-configured (fail closed when key set) |
| Heartbeat health | **Existing** — `/api/heartbeat/status` | surface in Today |
| Live-gate posture | **Existing** — status endpoints + integrity invariant (gate count 0) | plain-English "Sending is off" card |
| Campaign safety posture | **Existing** — `/api/reactivation/status` thresholds | needs "telemetry trusted?" qualifier (webhook health) |
| Failed jobs / dead letters | **Missing** | Phase 14 |

**Honesty rule (already a repo convention):** if the system can't prove something, the UI says "Not connected yet" / "Can't verify" — never fabricate.

## 11. Security & privacy model

**Existing:** token→role auth with dual permission+capability checks; least-privilege cron token; OAuth token encryption at rest; secret-scan integrity checks + secret-exposure tests; PII redaction in growth inbox; HMAC product-event webhook; signed unsubscribe tokens; state snapshot redaction.

**Recommended additions:** SendGrid webhook signature verification (Phase 0); sensitive-flag on Events with safe-summary requirement (§4); data/privacy-request workflow as a first-class queue type (Phase 7) — deletion requests must never be casually dismissible; aggregate-by-default rule for anything leaving the internal surface; no raw criminal-record detail anywhere in the Command Center (the lifecycle sync already enforces "operational fields only" — keep that contract for all future adapters).

## 12. Autonomy levels

Six levels (0–5 per the brief), mapped onto existing machinery:

| Level | Meaning | Existing mechanism |
|---|---|---|
| 0 Off | nothing runs | engine not registered / autopilot OFF and no plan value |
| 1 Monitor | read + summarize | plan()-only engines (B3/B4/B7) — **Existing** |
| 2 Draft | prepare work, no external action | drafting paths (Le-E, content, briefs) — **Partial** |
| 3 Queue for approval | create approval items | B2 plan→`queued_for_approval` — **Existing pattern**, generalize via Queue |
| 4 Execute approved | act only on an Approval | B2 act() sends only `approved` items — **Existing pattern**; extend to imports/releases via policy engine |
| 5 Safe autopilot | internal, reversible, non-human-facing | autonomy-cycle auto_safe — **Existing pattern** |

Per-agent level lives in the agent registry; the static never-automatic deny-list (§7) applies at every level. Levels only increase after the observability layer (§10) proves the relevant telemetry trustworthy — that is the promotion criterion, not calendar time.

## 13. UI information architecture

**Primary page: `Today at LegalEase`** (Phase 1) — one scrollable page with ten sections (Good morning · Needs Roger · Running automatically · Watchlist · Money · People stuck · Partners & prospects · Meetings today · Drafts ready · System health). Plain English; engineering detail only behind Diagnostics.

**Existing pages are demoted to drill-downs, not deleted.** The current 8 nav sections (~80 sub-pages) remain reachable; nav collapses to: **Today · Queue · People (Contacts/Orgs) · Campaigns · Partners · Money · Proof · Settings** with everything else nested. Honest-zero convention stays.

Language mapping (enforced by copy review + existing founder-language tests): autopilot→"Running automatically", live-send flag→"Sending is off/on", heartbeat→"System pulse" (Diagnostics only), collection→never shown, hold→"Held for review", wave release→"Approve this send group".

## 14. Settings simplification model — Phase 16

Seven sections: Company · Products · Email & Sending · Campaign Safety · Integrations · Admin Users · Diagnostics. Each setting states: what it controls, current state, affects-production?, risk, what happens if changed. Dangerous settings (anything on the never-automatic list) require owner/admin + confirmation + preview + approval-log entry. Everything currently engineering-flavored (engine toggles, storage diagnostics, raw counters) moves under Diagnostics. **Existing:** Settings & Health already contains most of the *content*; this is reorganization + copy + confirmation flows, not new capability.

## 15. Campaign safety model

**Existing (strong):** four stacked gates (env live-send flag · autopilot · per-wave human release · auto-pause thresholds), caps + windows + provider stratification, sticky suppression, compliance assembly that throws without CAN-SPAM fields, send-time re-checks.

**Missing → Phase 3:** UI control (today wave release/pause is terminal-only); full-consequence preview (audience, counts by held/suppressed/approved, touch, wave, timing, est. volume, gate state, threshold status, *and* cross-wave cadence effects — e.g. "approving this also makes Wave 1's Touch 2 due"); date-scheduled wave release with approval; a "telemetry trusted?" precondition wired to webhook health (§10). **Hard invariant kept:** no send without explicit approval + trusted telemetry; gates stay env-controlled (the UI schedules *within* released gates, it does not flip them).

## 16. Support / reply brain — Phase 7 (**Missing**, = B8)

Intake → classify (login/payment/refund/packet/bug/eligibility-legal/partner/privacy/complaint/urgent) → urgency → match Contact → draft (non-legal-advice) → queue item. Hard rules: no legal advice; no auto-send; no record mutation without approval; privacy/deletion requests get a dedicated workflow; language is "needs Roger review", never "escalated".

## 17. Revenue brain — Phase 4 (**Partial**)

Existing: Stripe revenue snapshot + signups wired; B4 trends deltas. Build: consumer/partner split, failed-payment + refund detection, invoice tracking, anomaly detection → `revenue alert` queue items. Read-only against Stripe; **never** changes payment/refund behavior.

## 18. Growth / lifecycle brain — Phase 5 (**Partial**)

Existing: reactivation lanes + held-contact review/disposition + funnel snapshots (honest-zero pending real webhooks). Build: funnel event ingestion (needs product bridge), stuck-people views, lane summaries (audience/held/approved/suppressed/readiness), release-from-hold **preview + confirm (no send)** as the first Level-3→4 workflow beyond B2's existing one.

## 19. RCAP partner/prospect brain — Phase 8 (**Partial**)

Existing: B5 sourcing (IRS BMF/LSC, no emails by design), rcap-revenue workbook import + scoring + queue tasks, partner modules. Build: contact enrichment (the named gap), 12-stage pipeline state on Organizations, outreach drafting into the Queue (send stays B2-gated).

## 20. Meeting brain — Phase 10 (**Missing**, feasible now)

Calendar (read-only, Existing) × entity graph → per-meeting brief (who/why/history/ask/avoid/follow-up draft). No auto-email. Good early Level-2 agent once Contacts index exists.

## 21. Social / content brain — Phase 11 (**Partial**)

Existing: full production pipeline (drafts, images, approval queue, publishing worker) with posting gates OFF; B6 autopilot deferred (platform approvals). Build: draft-only calendar + performance tracking; publishing stays gated.

## 22. Proof / impact / investor brain — Phase 12 (**Partial**)

Existing: Proof suite (evidence room, SOC 2, data room, reports). Build: scheduled report generation (partner impact, funder, investor updates, monthly proof packet), freshness alerts as queue items. Aggregate-only, no personal identifiers, no raw record details.

## 23. Source / packet / Wilma QA brain — Phase 13 (**Missing**, = B9)

Monitors only: source freshness, broken form links, packet-failure rate, state risk, Wilma telemetry, confusion patterns → QA queue items. Never auto-changes legal content, state rules, or packet templates.

## 24. Self-healing brain — Phase 15 (**Partial precedent**)

Existing: B3 codebase-health (drift/dead-module detection), smoke-test center, verify-production probes. Build: version-mismatch detector (the exact failure we just lived through), failed-route/webhook watchers, test-failure summarizer, fix-prompt generator, proposed-branch creator. No auto-merge/deploy/mutation — output is always a queue item + prompt/PR proposal.

## 25. Phased implementation roadmap

| Phase | Name | Status today | Gate to start |
|---|---|---|---|
| 0 | Ground truth & trust repair | **In progress** (audit done; webhook patch this run; deploy promote = Roger) | — |
| 1 | Brain foundation (Queue, entity index, Today page) | Missing | Phase 0 write/webhook trust proven |
| 2 | Dead-simple intake | Partial (consumer wired) | Phase 1 Queue |
| 3 | Campaign command w/o terminal | Missing (terminal-only today) | Phase 0 telemetry trusted + Phase 1 approvals |
| 4 | Revenue brain | Partial | Phase 1 |
| 5 | Growth/lifecycle brain | Partial | product event bridge |
| 6 | Inbox/reply brain | Read-only exists | Gmail compose scope (external) |
| 7 | Support brain (B8) | Missing | Phase 1 |
| 8 | RCAP sales brain | Partial | Phase 1 entity graph |
| 9 | Partner onboarding brain | Partial | Phase 8 |
| 10 | Meeting brain | Missing | Phase 1 Contacts |
| 11 | Social/content brain | Partial | — (draft-only) |
| 12 | Proof/impact brain | Partial | Phase 1 |
| 13 | Source/packet/Wilma QA (B9) | Missing | product telemetry bridge |
| 14 | Durable outbox | Missing | before Level-4-at-scale autonomy |
| 15 | Self-healing brain | Precedents exist | Phase 14 for actions |
| 16 | Settings simplification | Content exists | Phase 1 UI patterns |

## 26. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Stale prod deploy breaks writes/telemetry silently (live now) | **Critical** | Phase 0: version-truth surfacing + write-health monitor; manual promote discipline until then |
| Webhook forgery (no signature verification) | High | Phase 0 patch: ECDSA verify-if-configured, fail closed when configured |
| Full-state read-modify-write races/fragility | High | scoped writes on hot paths (webhook patch); serialize mutations (exists); outbox later |
| Silent non-persistence ("B1 trap") | High | membership tests (exist) + write-health unknown-collection warning (Phase 0/1) |
| Autonomy increase before telemetry trusted | High | §12 promotion criterion; never-automatic deny-list |
| Unified layers drift from domain truth | Medium | Queue/entity/event layers are projections; domain collections stay authoritative |
| UI rewrite destabilizes working surfaces | Medium | additive-only; existing pages become drill-downs; render-guard patterns exist |
| Sensitive data leaking into summaries/logs | High | sensitive-flag + safe-summary rule; secret-scan tests; aggregate-by-default |
| Single-file server growth (35.7k lines) | Medium | new logic in sibling modules (established pattern); no big-bang refactor |
| PostgREST 1000-row cap regressions | Medium | paged reads exist; keep pagination tests; snapshot retention policy (deferred decision, tracked) |

## 27. Acceptance criteria per phase (abbreviated)

- **Phase 0:** webhook events persist + counted + visible; signature verification active when key configured; write failures visible within one heartbeat; prod-behind detectable from the UI or one endpoint; all existing tests green.
- **Phase 1:** Roger understands the business in <60s from Today; every engine can write a queue item; every acting item has an Approval; plain English throughout; no terminal for routine monitoring.
- **Phase 2:** any supported list imports via one button + preview + confirm; imports never send; provenance + hold stamped.
- **Phase 3:** wave scheduling from UI with full-consequence preview incl. cross-wave cadence effects; no send without approval + trusted telemetry.
- **Phases 4–13:** each brain ships monitor→draft→queue in that order; hard rules per section above.
- **Phase 14:** every durable action idempotent, leased, retried, dead-lettered, manually retryable.
- **Phase 15:** system proposes (never performs) fixes with evidence links.
- **Phase 16:** every setting has plain-English what/state/risk/consequence; dangerous settings confirmed + logged.
