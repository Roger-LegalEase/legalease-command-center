# LegalEase Command Center — Build Plan & System Status

_Generated 2026-07-02. A complete map of what exists in the repo, its purpose, current status, architecture, and remaining build/activation work._

**Status legend:**
- 🟢 **Live** — wired, deployed-capable, actively works
- 🟡 **Inert (gated off)** — fully built, held behind safety gates; flip gates to activate
- 🟠 **Staged / import-only** — built and writes data, but inert by design (nothing sends/acts)
- 🔵 **Planned** — designed/specced, not built
- ⚪ **Deferred** — built-intent blocked on an external dependency
- 🔴 **Blocker** — currently broken / needs action

---

## 1. What the Command Center is

A single-operator "run the whole company" console for LegalEase — an internal founder/ops cockpit that combines:

- **Daily operating rituals** (morning brief, focus, evening reflection, daily closeout, guided "Daily Run")
- **Growth & marketing automation** with human-approval gates
- **Social content production & publishing** (LinkedIn / X / Meta / Threads)
- **Partner-program & RCAP revenue operations**
- **Consumer reactivation** (former Expungement.ai users) and **B2B prospect discovery**
- **Investor/compliance "Proof"** (evidence room, SOC 2 readiness, data room)
- An assistant surface ("Le-E")

**Design philosophy:** review-first and fail-safe. Every outward-acting capability is gated by (a) an autopilot toggle defaulting OFF and (b) a `*_LIVE_SEND` / `ENABLE_LIVE_*` flag, with **dry-run as the default**. A system invariant asserts the count of enabled live-posting gates must be 0 unless deliberately turned on.

---

## 2. Architecture at a glance

| Layer | Implementation |
|---|---|
| **Server + UI** | One Node HTTP file, no framework: `scripts/preview-server.mjs` (35,686 lines). Serves both the JSON API (~188 exact routes + ~30 regex routes) and a server-rendered single-page dashboard (`htmlShell()`, all CSS/JS inlined). |
| **Domain layer** | ~60 sibling `scripts/*.mjs` modules (engines, importers, connectors). |
| **Persistence** | `scripts/storage.mjs`: `JsonStore` (local JSON file) or `SupabaseCoreStore` (prod). State decomposed into `(collection, item_id, payload)` rows in one generic Supabase table `leos_core_records`. |
| **Auth** | `scripts/access-control.mjs` + `scripts/roles.mjs`: token→role, dual permission+capability check. |
| **Automation clock** | `scripts/heartbeat.mjs` + `heartbeat-engines.mjs`: hourly Render cron → `/api/heartbeat/tick` runs all registered engines with ET-aware windows and autopilot gating. |
| **Hosting** | Render (`render.yaml`): a web service + an hourly cron service. Supabase for state. `autoDeploy: false` (manual promote). |
| **Runtime deps** | Only two: `pg` (Postgres) and `sharp` (images). OpenAI/Anthropic/SendGrid/OAuth are all raw HTTP. |

### Storage model (key facts & pitfalls)
- **Backend selection:** Supabase only if `STORAGE_BACKEND=supabase` + creds present + not `LOCAL_DEMO_MODE`; else local JSON. Prod = Supabase; this Codespace = JSON fallback.
- **`coreStateCollections`** (storage.mjs:13–121) is the allow-list of ~90 collections that persist. **The "B1 trap":** any new collection must be added here AND kept in sync with its owning module, or it silently fails to persist (no error). Tests assert membership.
- **PostgREST 1000-row cap:** every response caps at 1000 rows; unpaginated reads silently truncate. Fixed via `supabaseFetchAllRows` paging under stable `(collection,item_id)` order.
- **Write path:** upsert-first (`on_conflict=collection,item_id`, merge-duplicates), then reconcile/delete orphans only within collections present in the snapshot (a partial write can't mass-delete).
- **ON CONFLICT dedup:** `coreRecordsFromState` dedupes rows by `(collection,item_id)` via a Map so duplicate ids collapse to one row. (Deployed to prod 2026-07-03.)
- **The full-state-write trap (found live 2026-07-08, PR #30):** a full `writeState` carries a pre-read snapshot of EVERY collection, so any scoped write landing in its read→write window is silently reverted (it reverted the reactivation live-mode arm on campaign day). Rule: **every mutation must go through `serializeStateMutation` and write via scoped `store.writeCollections({...})`** — never `store.writeState`. PR #30 fixed the four hottest paths (denial audit logging, product events, autopilot toggle, heartbeat tick); ~60 lower-frequency owner-action routes still use the old pattern and should migrate incrementally.
- **Read races:** `readState` assembles multi-page reads; a concurrent large write makes consecutive reads flap (mixed-version snapshots). Stable totals with flapping per-item values = a write in progress, not corruption — re-read after it settles.

### Auth model
- **Roles:** `owner`, `admin`, `operator`, `viewer` (+ legacy aliases). Dual model: coarse legacy permissions (`read/write/admin/approve/publish_review/compliance_review/...`) **and** fine capabilities (`mutate_state`, `manage_roles` owner-only, `run_internal_activation`, `approve_final_artifact`, ...). A request must pass **both** checks.
- **Tokens:** `COMMAND_CENTER_OWNER_TOKEN` (owner), `..._ADMIN/OPERATOR/VIEWER_TOKEN`, plus a least-privilege **`COMMAND_CENTER_CRON_TOKEN`** that may ONLY POST `/api/heartbeat/tick`.
- **Auth is required** whenever `STORAGE_BACKEND=supabase` and not demo (i.e. prod). Locally, auth is bypassed and the caller is a synthetic `owner`.

### Heartbeat / autonomy model
- Hourly cron POSTs the tick. Inside: ET-aware due logic — hourly engines run every tick; daily engines at `DAILY_RUN_HOUR_ET` (default 6am ET, DST-correct).
- **`plan()` always runs** (side-effect-free). **`act()` runs only when that engine's autopilot toggle is ON** (persisted `autopilotSettings[id]` > `AUTOPILOT_<ID>` env seed > default OFF).
- **3-layer double-run defense:** in-process mutex, per-engine-per-period `heartbeatRuns` ledger, and a TTL `heartbeatLease`. `force:true` overrides.

---

## 3. Build timeline (from git history)

- **2026-05-19** — Genesis: Growth Command Center operating layer
- **Jun 10–11** — RCAP Revenue OS foundation (import, approval-rules, suppression matrix, queue tasks, scoring)
- **Jun 20–24** — Operator UI "command surfaces": Today, Growth, Partners, Production, Proof, Settings, Cockpit home; product-event HMAC
- **Jun 25–26** — Live wiring (Revenue→Stripe, Users→signups, connector tiles); **Track B begins**: B1 heartbeat, B2 outreach OS
- **Jun 26–27** — B3 codebase-health, B4 engagement-growth, B5 prospect discovery, B7 operating-loops
- **Jun 28–29** — B2 live-send wiring (gates off), B5 live discovery (flag off), consumer list import
- **Jun 29–30** — Expungement.ai lifecycle sync, held-contacts review/disposition, `/api/version`
- **Jul 1** — SendGrid bounce backfill; Supabase write-conflict fix (⚠️ committed, not yet promoted)

Repo scale: 64 runtime modules, 134 test files, ~75k LOC in `scripts/`, 245 commits.

---

## 4. Component inventory & status

### 4.1 Core operator surfaces (dashboard) — 🟢 Live
Eight nav sections (all server-rendered, hash-routed, ~80 sub-pages):

| Section | Contents | Status |
|---|---|---|
| **Cockpit** | Command-center home tiles (Revenue, Contacts & Lists, etc.) | 🟢 |
| **Today** | Overview, focus, operating-memory, morning-brief, evening-reflection, daily-closeout, guided Daily Run | 🟢 |
| **Growth** | Growth workspace, inbox, campaigns, funnel, content-bank, sources, Upload-a-list, Contacts & Lists, Prospects, Revenue | 🟢 (some tiles honest-zero until sources wired) |
| **Partners** | Partner hub, programs/pages/dashboards/reports/proposals, milestones, RCAP activation, pilots | 🟢 |
| **Production** | Queue review desk, posted, assets, autonomy, automation inbox | 🟢 |
| **Proof** | Metrics, evidence-room, reports, data room, SOC 2 suite (access/audit/changes/vendors/incidents/evidence/policies) | 🟢 |
| **Settings & Health** | Settings, data-integrity, operator-manual, handoff-contract, roles, tasks, os-health, smoke-test, operator-search, connector tiles | 🟢 |
| **Le-E** | Real assistant (v2, 2026-07-12): one plain conversation, owner-only persisted history, model-backed answers grounded in a capped PII-scrubbed state digest (`lee-assistant.mjs`), propose-only via `automationSuggestions` (legacy `leeActionProposals` lane migrated). OpenAI-backed (default `gpt-5.6-terra`, override via `LEE_OPENAI_MODEL`); reuses the shared `OPENAI_API_KEY`; honest no-key fallback otherwise. | 🟢 |

Honest-zero UX: wherever a real data source is absent, the UI shows a "not yet wired" badge rather than fabricating numbers (e.g. Revenue refuses fake figures; image gen falls back to branded placeholders when OpenAI image API absent).

### 4.2 Track B automation engines
Registered in `heartbeat-engines.mjs`; all `act()` paths default autopilot OFF.

| Engine (id) | Purpose | Status | Gates | To activate |
|---|---|---|---|---|
| `autonomy-cycle` | Internal task/priority automation (never sends/publishes) | 🟢 Live | autopilot (auto_safe only) | toggle on; no external risk |
| `sources-daily` | Daily external source import | 🟢 Live | autopilot + server dep | wired |
| `publishing-run` | Scheduled publishing worker | 🟢 Live | autopilot + inner posting gates | wired (posting gates still off) |
| **B1** `reactivation-sequencer` | Consumer B2C reactivation (ex-Expungement.ai users) | 🟢 **Operable from the UI** (PR #29; first live campaign day 2026-07-08) | Owner **live mode** (`POST /api/reactivation/live-mode` / Run–Stop buttons on the campaign page) is the send authority and flips autopilot with it; legacy `REACTIVATION_LIVE_SEND` still works but is no longer required; `REACTIVATION_SEND_DISABLED` = master kill; per-wave release; threshold auto-pause | press Run on the campaign page (waves already released per §6) |
| **B2** `outreach-sequencer` | RCAP B2B cold outreach (nonprofits/legal-aid/PDs) | 🟡 Inert | `OUTREACH_LIVE_SEND` off, autopilot off, SendGrid key, human approval, fail-closed routing | DNS (SPF/DKIM/DMARC) + SendGrid + sequences + flip gates + approve queue |
| **B3** `codebase-health` | Read-only source audit (registration drift, dead modules, CI gaps) | 🟢 Live (plan-only, no act) | none | runs on daily tick |
| **B4** `engagement-growth` | Read-only growth/engagement trending (real signals only) | 🟢 Live (plan-only, no act) | injected GET fetcher only | runs on daily tick |
| **B5** `prospect-discovery` | Tier-1 org discovery (IRS BMF + LSC) → human-approved promotion; NO send path | 🟡 Inert (loaders live-wired) | `PROSPECT_LIVE_DISCOVERY` off, autopilot off, human-only approve | flip flag + autopilot; promotion still human-gated, promoted orgs carry no email |
| **B7** `loop-*` (×6) | Read-only operating monitors: cash/runway, capacity, aging, partner-health, outreach-health, os-health | 🟢 Live (plan-only, no act) | none | runs on daily tick |
| **B6** social autopilot | Autonomous social posting | ⚪ Deferred — no engine exists | — | blocked on LinkedIn/Meta app approval |
| **B8** technical support engine | Support triage/automation | 🔵 Planned | — | not built (defined in master plan) |
| **B9** Wilma safety telemetry monitor | Safety telemetry | 🔵 Planned | — | not built |

**Only three engines have real `act()` side-effect paths** — B1 reactivation, B2 outreach, B5 promotion — and all three are inert behind stacked gates. B3/B4/B7 are structurally plan-only (autopilot toggle is a clean no-op). B5 can never self-approve (structural throw); promoted contacts are never auto-enrolled.

### 4.3 Send pipelines
Both flow through one SendGrid v3 endpoint via gate-checking dispatchers; nothing hits the network unless a `"live"` decision returns. For B2 outreach that means `OUTREACH_LIVE_SEND` + key; for reactivation the authority is the owner **live-mode record OR** the legacy `REACTIVATION_LIVE_SEND` flag, minus the `REACTIVATION_SEND_DISABLED` kill switch, with campaign-active / threshold / ET-window re-checked at send time (PR #29).

- **Reactivation:** `planReactivation` (released waves → due touches by cadence `[1,4,9,16,30]`, weekday 8–17 ET window, provider-stratified, capped `min(perTickMax 150, perWaveDayCap 1400)`) → `actReactivation` (re-checks + auto-pauses on threshold trip) → `runReactivationSend` → SendGrid. Waves 300/700/1200/remainder; `releaseWave()` is the per-wave human gate. Webhook `applyReactivationEvent` records suppression + pauses contacts on bounce/unsub/complaint/click. Thresholds: hard_bounce 2% / spam 0.1% / unsub 2.5%.
- **Outreach (B2):** `planOutreach` (8-reason suppression gate, fail-closed classification routing, caps: 25/day, 2/domain, 10/class) → queue `queued_for_approval` → human approve → `actOutreach` (re-checks at send) → `runOutreachSend` → SendGrid.
- **Shared compliance:** `assembleCompliantMessage` throws if postal address unset (structural CAN-SPAM), builds text+HTML with HMAC-signed one-click unsubscribe + `List-Unsubscribe` headers + Dover DE footer. Reactivation reuses it via config overrides.

### 4.4 Data / revenue / lifecycle modules

| Module | Purpose | Status |
|---|---|---|
| `rcap-revenue-os.mjs` | Import RCAP sales workbook → accounts/contacts/deal-seeds/queue-tasks; sticky suppression; internal scoring | 🟢 Live (import route wired, owner/admin-gated). Preview function built but 🔵 unwired (no route) |
| `partner-lifecycle.mjs` / `partner-program-engine.mjs` / `partner-journey-handoff-contract.mjs` | 13-stage partner lifecycle; RCAP 90-day program (draft-only generators, dashboard bridge); handoff contract | 🟢 Live |
| `production-activation.mjs` | Production activation checklist/gating (RCAP activation flow) | 🟢 Live |
| `consumer-list-import.mjs` | "Upload a list" front door → reuses reactivation import + wave-assignment; every contact held | 🟠 Staged (import-only; the one wired upload type) |
| `expungement-lifecycle-sync.mjs` | Receiving end for Expungement.ai lifecycle records; stages campaign-eligible contacts ALWAYS held | 🟠 Inert (ingest-only; **no live source pull exists**) |
| Other upload types (rcap_prospect, social_calendar, rcap_revenue) | Upload-list front door | 🔵 Stubbed / route-reuse |

### 4.5 Social / OAuth connectors
All live-posting gates OFF by invariant. `channel-connectors.mjs` (social OAuth) + `google-workspace.mjs` (read-only).

| Platform | Status |
|---|---|
| **LinkedIn** | 🟡 Most-complete: OAuth exchange + publish adapter + dry-test built; live posting off, creds not set |
| **X / Twitter** | 🟡 OAuth (PKCE) + publish built; gate off, no creds |
| **Meta (FB Page + Instagram)** | 🟡 OAuth + publish built; needs approved permissions; gates off |
| **Threads** | 🟡 Config only; lower priority |
| **Google Workspace** | 🟢 Connect-ready (creds present) but **read-only** (Gmail/Calendar scan → insights); cannot post by design |
| **TikTok** | 🔵 Bare gate placeholder, no connector |

### 4.6 Supporting runtime modules (all 🟢 Live)
`priority-engine`, `tasks-engine`, `review-approval-engine`, `autonomy-engine`, `os-health`, `smoke-test-center`, `evidence-room`, `operating-memory`, `operator-search`, `operator-pulse-feeders`, `growth-inbox` (rule + optional OpenAI classification, PII-redacted), `lee-engine` (+ context/quick-capture), daily-ritual modules (`daily-run-session`, `morning-brief`, `evening-reflection`, `daily-closeout`, `daily-operating-loop`), `state-integrity`, `auth-endpoint-hardening`.

---

## 5. Roadmap: intended vs built

**Track A (stabilize — must precede B):**
| Step | What | Status |
|---|---|---|
| A0 | Commit/push discipline | 🟢 |
| A1 | JSON → Supabase live data | 🟢 |
| A2 | Wire real sources (Stripe→Revenue, signups→Users, proof, runway) | 🟢 |
| A3 | Visual/UX cleanup to mockup | 🟠 Outstanding |
| A4 | Resolve test/security flags | 🟢 (secret-exposure resolved) |
| A5 | Rotate exposed keys | 🟠 Outstanding |

**Track B:** B1 🟢, B2 🟡, B3 🟢, B4 🟢, B5 🟡, B6 ⚪, B7 🟢, B8/B9 🔵. Cross-cutting: a Capability Registry discipline and a 3-position Autonomy Dial (Stage-only → Autopilot-with-glance → Full), turned up per-engine as each earns trust.

**Growth Automation spec (parallel lineage):** `LegalEase_OS_Growth_Automation_Build_Plan_Updated.md` (v2, supersedes v1) — a granular 0–12 phase campaign control-plane spec (loop foundation → Instagram audience import → campaign import → content/approvals → email sequence engine → consumer loop → social connectors → reply triage → partner distribution → metrics/attribution → proof/consent → activation). The master plan operationalized most of this as **heartbeat engines** rather than the spec's outbox/lease/dead-letter pipeline. Notably **not yet built**: the durable outbox/dead-letter job model, reply triage, attribution, and the v2 Instagram audience-import phase.

---

## 6. Reactivation campaign — current live state (2026-07-08, campaign day)

_(Queried live from prod this session.)_
- `campaignStatus`: **active** · `releasedWaves`: **[1, 2]** · waves 3/4 unreleased
- Contacts: 3,835 total; enrolled 943 (Wave 1 = 254, Wave 2 = 689; counts shifted ~05:45 ET 2026-07-08 in an unexplained wave reassignment — accepted as baseline by Roger, root cause still open)
- Pre-campaign baseline: **sent 300** (Wave 1 Touch 1, 2026-06-29), hard bounces 4 (1.33%), complaints 0, unsubs 0, threshold untripped. 213 of the 300 are **wave-0/unattributed** (legacy attribution gap — now surfaced on the campaign page as display-only diagnostic)
- Telemetry: SendGrid Event Webhook live since 2026-07-03, signature verification **enforced**, unsigned POSTs fail closed 401
- **2026-07-08 is the first owner-operated campaign day**: live mode armed via the Command Center at ~05:58 ET (first arm was clobbered by the §2 full-state-write bug — the retry stuck); Wave 1 follow-ups + Wave 2 Touch 1 (~838 due) send through the hourly heartbeat, weekdays 8am–5pm ET, ≤150/hr, ≤1,400/day

---

## 7. Environment & gating reference (selected)

| Var | Controls |
|---|---|
| `STORAGE_BACKEND` | `json` (local) vs `supabase` (prod) |
| `LOCAL_DEMO_MODE` | Forces local/demo; disables auth |
| `COMMAND_CENTER_OWNER_TOKEN` | Owner sessions; required by `/api/state` in prod |
| `COMMAND_CENTER_CRON_TOKEN` | Least-privilege heartbeat-tick-only token |
| `AUTOPILOT_<ENGINE_ID>` | Per-engine autopilot seed (default OFF) |
| `REACTIVATION_LIVE_SEND` | Legacy reactivation live-send env gate (default OFF). No longer required — the owner live-mode record is the normal authority (PR #29) |
| `REACTIVATION_SEND_DISABLED` | Master kill switch over BOTH reactivation send authorities (default OFF/unset) |
| `OUTREACH_LIVE_SEND` | B2 outreach live-send gate (default OFF) |
| `PROSPECT_LIVE_DISCOVERY` | B5 discovery gate (default OFF → zero rows/no I/O) |
| `ENABLE_LIVE_{LINKEDIN,FACEBOOK,INSTAGRAM,X,TIKTOK,THREADS}_POSTING` | Per-platform posting gates (all OFF, invariant-enforced) |
| `SENDGRID_API_KEY` | Shared ESP key (B2 + reactivation) |
| `PRODUCT_EVENT_WEBHOOK_SECRET` | Signs `/api/events/product` (fail-closed) |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | Encrypts stored OAuth tokens at rest |

---

## 8. Testing & CI
- **CI (GitHub Actions, added 2026-07-08):** `.github/workflows/test.yml` runs `npm run check` + `npm test` on every PR and push to main. CI's clean environment matches the clean-worktree gate by construction.
- `npm run check` — `node --check` syntax gate across ~115 files (fast).
- `npm test` — ~80 test files. In a DIRTY local checkout, `.env.local` leaks into spawned test servers and 401s the auth suites (e.g. `test-soc2-export`) — run the chain in a clean worktree (or rely on CI), not in the working checkout.
- `npm run verify` — check + test + `npm audit`.
- 134 total `test-*.mjs` covering auth/security, all Track B engines, RCAP/partner, daily rituals, social connectors, UI/layout, persistence (incl. supabase pagination & reconcile), Le-E, Google, tasks.

---

## 9. 🔴 Current blockers & remaining work (refreshed 2026-07-08)

_Resolved since the 2026-07-02 revision: the stale-prod-deploy / write-conflict blocker (promoted 2026-07-03); SendGrid webhook config + signature enforcement + Wave 1 backfill (2026-07-03); webhook observability on `/api/reactivation/status`; B1 operability from the UI (PR #29, merged + deployed 2026-07-08); CI (PR #31)._

### Pending deploy — scoped-write hardening (PR #30)
- Fixes the §2 full-state-write clobber class found live on campaign day: denial-audit logging (bots on the public URL caused a full-state write per denied request — 857 of the 1,000 capped SOC 2 audit entries were denials), product events (also registers `automationEvents`/`automationSuggestions`/`connectorStatus`, which had NEVER persisted on Supabase), the autopilot toggle, and heartbeat-tick serialization.
- **Deploy only after a campaign day's send window closes** (it changes write behavior on paths a running campaign touches).

### Open engineering debt
- **~60 remaining full-state `writeState` sites** (daily-run routes, tasks, approvals, content bank, growth, production-activation, …) — migrate incrementally to serialized + scoped writes (the PR #30 pattern). These fire only on operator actions, but each is clobber-capable.
- **Wave reassignment root cause (2026-07-08 ~05:45 ET):** something re-ran wave assignment on prod unprompted (counts moved 265/675/1280/1615 → 254/689/1292/1600). Accepted as campaign-day baseline; still needs a root cause.
- **Wave-0 unattributed sends (213 of 300):** attribution gap for pre-wave-display sends; surfaced as a display-only diagnostic on the campaign page; fix or formally accept.
- **Durable campaign-day alerting:** activate the Phase 18I alerts engine (env `ALERTS_EMAIL_TO` + `ALERTS_LIVE_SEND` + in-app switch + alerts autopilot) so threshold trips email the owner instead of relying on an open operator session.

### Activation work (not building — flipping gates once prerequisites land)
- **B2 outreach:** DNS (SPF/DKIM/DMARC on the outreach domain / Route 53) + SendGrid domain auth → `OUTREACH_LIVE_SEND=true` + autopilot + load sequences/campaigns + approve queue.
- **B1 reactivation:** ✅ operable from the UI since PR #29 — remaining activation decisions are per-wave releases (waves 3/4) via the existing approval flow.
- **B5 prospecting:** `PROSPECT_LIVE_DISCOVERY=true` + autopilot (approval stays human-gated).
- **Meeting briefs / Google Workspace:** make the OAuth connection (connect-ready, read-only by design).
- **Track A cleanup:** A3 visual/UX pass to the mockup; A5 rotate exposed keys.

### Not yet built
- **B6 social autopilot** (⚪ deferred — LinkedIn/Meta app approval).
- **B8 technical support engine**, **B9 Wilma safety telemetry monitor** (🔵 planned).
- From the Growth Automation v2 spec: durable **outbox/dead-letter** job model, **reply triage**, **attribution/metrics** pipeline, **Instagram audience import** phase.
- `/api/rcap-revenue/preview` route (function exists, unwired); non-consumer **Upload-a-list** types.
- **Expungement.ai lifecycle sync live source pull** (the receiver is built, ingest-only; no source pull exists).

---

_This document is a point-in-time synthesis (last full refresh 2026-07-08). The live send-gate posture and deploy state change over time — re-verify via `/api/version`, `/api/safety/posture`, and `/api/reactivation/status`._
