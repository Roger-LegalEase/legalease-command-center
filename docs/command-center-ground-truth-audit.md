# Command Center — Ground-Truth Audit

_Audited 2026-07-02 against live production and the working tree (branch `command-center-phase0-trust`, base `0a8a754`). Companion docs: `legalease-command-center-brain-nerve-center-build-plan.md` (product brief), `docs/command-center-state-of-art-architecture.md` (target architecture), `docs/COMMAND_CENTER_BUILD_PLAN.md` (full system map)._

**Confidence labels:** Confirmed (verified by tool/API output this session) · Likely · Partial · Unknown · Not found.

---

## 1. Executive summary

The machinery is real and well-gated; the **trust layer and the operator experience are not**. Five blunt facts:

1. **Production is running stale code and it's breaking writes** (Confirmed). Prod serves commit `c02db48`; the fix `0a8a754` sits unpromoted. Every full-state write on prod fails with a Postgres `ON CONFLICT` error — which is why SendGrid webhook telemetry is zero and the autopilot toggle API errors. One manual Render promote fixes it. **This is the single highest-priority action and only Roger can do it.**
2. **Campaign control is terminal-only and the UI misreports it** (Confirmed). Wave release, pause, approval, gate state — all shell/API only. The Campaigns page read a nonexistent field (`wave_released_at`) so released waves showed "Wave not released" forever (fixed this run).
3. **The UI's safety claims are hardcoded strings, not state** (Confirmed). "Email sending: Off" is a literal constant in at least 4 places. When reactivation goes live, every settings/health surface will still say sending is off. The truthful values exist in `/api/reactivation/status` and `/api/outreach/status` — which no UI fetches.
4. **There is no unified Queue, Contact, timeline, or approvals log** (Confirmed). Four contact silos, five approval mechanisms, per-module event ledgers, and a Queue page that never renders the actual `approvalQueue` collection (Today literally points Roger at a dead end). The one genuinely unified layer: the suppression ledger.
5. **The safety architecture itself is excellent** (Confirmed). Every acting engine sits behind stacked gates (autopilot OFF + env live-flag OFF + human release/approval + thresholds); plan/act split, lease/ledger/mutex; fail-closed routing; structural CAN-SPAM throws. This run added the missing trust pieces: webhook signature verification, scoped webhook writes, webhook + write health telemetry.

## 2. What the build plan says should exist

The brief (`legalease-command-center-brain-nerve-center-build-plan.md`) calls for: Phase 0 trust repair (deploy/version truth, webhook hardening, backfill, write-health monitor) → Phase 1 brain foundation (unified Queue, Contact/Org/Event/AgentRun/Approval objects, Today at LegalEase page) → phases 2–16 (intake, campaign UI, revenue/growth/inbox/support/RCAP/meeting/social/proof/QA brains, outbox, self-healing, settings simplification), under a 6-level autonomy model with an absolute never-automatic list.

## 3. What the repo actually has

- **Runtime:** one no-framework Node server, `scripts/preview-server.mjs` (~35.7k lines) = all API routes (~220) + server-rendered SPA; ~60 domain modules; 2 runtime deps (`pg`, `sharp`). Persistence: `scripts/storage.mjs` — local `JsonStore` or `SupabaseCoreStore` over one `leos_core_records` (collection, item_id, payload) table with an allow-list (`coreStateCollections`, ~90 collections), paged reads, upsert+reconcile writes. Auth: token→role (owner/admin/operator/viewer + least-privilege cron token), dual permission+capability checks; auth enforced only in hosted/supabase mode. Deploy: Render web + hourly cron (`render.yaml`), **`autoDeploy: false`** — manual promote required.
- **Automation:** hourly heartbeat, ET-aware; `plan()` always, `act()` only under autopilot (default OFF). Engines: monitors B3/B4/B7 (live, plan-only), reactivation B1r + outreach B2 + prospects B5 (built, inert behind stacked gates), autonomy-cycle/sources/publishing (live, internally gated). B6 deferred; B8/B9 not built.
- **Queue/memory:** see §13 — siloed collections, no unified objects.
- **Commands:** `npm run check` (syntax over ~125 files), `npm test` (71 of 134 test files chained), `npm run verify`, `verify:production`. **No lint, no build step, no CI config** (Confirmed).

## 4. What is confirmed live (verified this session)

| Check | Result |
|---|---|
| `GET /api/version` (prod) | `commit: c02db486…` — **one commit behind local main (`0a8a754`)** |
| `POST /api/outreach/webhooks/sendgrid` (prod, no-op probe) | **HTTP 400** `Supabase DB 500: ON CONFLICT DO UPDATE command cannot affect row a second time` |
| `POST /api/heartbeat/autopilot` (prod, idempotent no-op) | **Same ON CONFLICT error** — full-state writes broken (verified 2026-07-02 earlier in this working session) |
| `GET /api/reactivation/status` (prod) | `campaignStatus: active`, `pausedReason: ""`, `releasedWaves: [1,2]`, enrolled 1,008 (W1 302 / W2 706), `rates.sent: 300`, delivered/bounce/complaint/click **all 0**, autopilot **false**, liveSendFlag **false**, sendgridKeyPresent true |
| Local: `npm run check` | PASS |
| Local: new + affected tests (8 suites) | PASS (see §17–18) |
| Local e2e (real server boot) | Webhook processes + persists scoped; signature enforcement verified (valid→200 verified:true; missing/tampered→401); health surfaces on both endpoints |

## 5. What is stale or uncertain

- **Prod deploy** — stale by exactly one commit (Confirmed). `deployedAt: "unknown"` on `/api/version`.
- **SendGrid Event Webhook dashboard config** — Unknown. The write failure fully explains zero telemetry, so the webhook may or may not be correctly pointed at the `-prod` URL with all event types enabled. Verify after promote (§18: verification steps).
- **Wave 1 true delivery outcomes** — Unknown until backfill (SendGrid Suppressions API path exists: `reactivation-backfill-sendgrid-bounces.mjs`).
- **Whether prod cron ticked reliably through the write breakage** — Likely yes for scoped-write engines (Wave 1 sent 300 via the heartbeat), Unknown for engines whose plan snapshots persist via full-state writes.

## 6. Trust blockers (ranked)

1. **Unpromoted deploy breaking all full-state writes on prod** — blocks webhook telemetry, autopilot toggling, and any state-mutating UI action. _Fix: Roger promotes `0a8a754` (or this branch when merged) in Render._
2. **Webhook had no signature verification and no health telemetry** — fixed in this branch (fail-closed when key configured; health singleton + status surfacing). Needs the public key set in Render env to enforce.
3. **Write failures were invisible** — fixed in this branch (`writeHealth` on `/api/health/supabase` + `/api/reactivation/status`).
4. **No deploy-behind detection** — `/api/version` exists but nothing compares it to main. Recommended first slice of Phase 1 System-health.
5. **Safety posture strings hardcoded in UI** (§12) — the app will misreport live gates the moment they flip.

## 7. Safety risks

- **Resume-path surprise (behavioral, not code):** campaign is `active` with waves [1,2] released and 1,008 enrolled; flipping the two gates resumes sending on the next in-window tick *and* Wave 1 Touch 2 comes due by cadence. Any future campaign UI must preview cross-wave consequences.
- **Auto-pause monitor is blind** until webhook telemetry actually persists on prod (threshold monitor evaluates `reactivationEvents`, which is empty).
- **Restore is the one destructive UI control** (`restoreBackup`) gated by a single `window.confirm`, no approval log.
- **34 decorative toast-only buttons** look like controls but do nothing — trains the operator to distrust buttons (or worse, to trust fake ones).
- Gates/permissions themselves: solid (Confirmed by tests: autopilot default-off, dry-run defaults, cross-gate isolation, live-gate-count-0 invariant asserted in 62 test files).

## 8. UI confusion points

- **Three overlapping live settings/health surfaces** (Settings `#settings`, More `#more`, App Status `#os-health`) restating the same posture; the literal "Settings & Health" builder (`settingsHealthReadoutHtml`) is **dead code** — defined, never called.
- More page's "Activation Center", "External Action Outbox", "Social Accounts" sections are **hardcoded demo content**, not real records.
- Jargon on Roger-facing surfaces: "OS Health", "Data Integrity", "Safe Mode", "Autonomy", "Heartbeat monitors" (Today page), store/schema internals in the header badge.
- Today → "N approval items waiting → Open Queue" → Queue page **cannot show or approve those items** (approval dead-end).
- SendGrid/X "Connect"/"Test" buttons in Settings are toast-only fakes.

## 9. Data / write risks

- **Full-state read-modify-write everywhere:** ~90-collection snapshots rewritten for small mutations; one bad duplicate anywhere fails the whole batch (the exact prod failure). Mitigated this run for the webhook (scoped `writeCollections`); other hot paths (autopilot toggle, unsubscribe) still full-state — acceptable once `0a8a754` is live, candidates for scoping later.
- **JsonStore partial-write wipe hazard:** a scoped write against the JSON backend would have erased unrelated local state — now guarded (`writeCollections` merges on JSON; regression-tested).
- **The "B1 trap"** (unregistered collections silently don't persist) — real, documented, membership-tested; new `sendgridWebhookHealth` registered + asserted.
- PostgREST 1000-row cap — handled by paged reads; snapshot/ledger retention still an open deferred decision.

## 10. SendGrid risks

- Telemetry pipeline was: SendGrid → webhook → **400 on every batch** → nothing persisted (Confirmed root cause: stale deploy, §4). Events during the outage are not replayable via webhook; use the Suppressions-API backfill for bounces; delivered counts for Wave 1 may be partially unrecoverable (Unknown).
- No signature verification existed despite comments claiming it (fixed this branch; **fail closed only when `SENDGRID_WEBHOOK_PUBLIC_KEY` is set** — set it in Render).
- Dashboard config unverified (§5). Domain reputation currently un-monitored — Phase 4/Watchlist item.

## 11. Campaign risks

- **All control is terminal-only** (release/pause/preview/backfill); the rich `/api/reactivation/status` payload has zero UI consumers.
- Campaigns page bugs: the `wave_released_at` misread (fixed this run — now reads `enrolled_at`); rows cap at 80 with one row per contact, so the page mixes 3,835 contact-rows into a "campaigns" list (design smell, Phase 3).
- No date-scheduled release mechanism; no UI preview of who/when/which touch/estimated volume; thresholds invisible to the operator.

## 12. Settings problems

- No dangerous control exists in the UI at all (good for safety, bad for operability): autopilot toggles, outreach approve, prospect approve, wave release are API/terminal-only with no confirmation UX because there is no UX.
- **Hardcoded posture strings** ("Email sending: Off" at 4+ sites; RCAP "Outreach automation: Off") — only social posting gates are live-derived. Must become derived from `/api/reactivation/status` + `/api/outreach/status` before any gate flips.
- Duplication (same off-switch list rendered 3× within More), dead code (`settingsHealthReadoutHtml`), fake buttons (34), internals leaking into labels (collection names, `state.runtime.livePostingGates`) — though correctly tucked into `<details>` disclosures.
- Restore lacks an approval log. Brand-asset registration is the only other mutating Settings control.

## 13. Queue / company-memory gaps

- **Queue:** `approvalQueue` (posts/reports/outreach_message) is never rendered by the Queue page; the page aggregates posts/growthInbox/reports/partners/rcap tasks instead. Five parallel approval mechanisms; no single approvals log; `leeActionProposals` and `autonomyDecisions` written but never rendered.
- **Contacts:** four silos (reactivation / outreach / rcapRevenue / expungementLifecycle), no shared ID, duplicate person-rows across collections; UI "Unified contacts" is a display-only merge. **Suppression is the only unified layer** (shared ledger, checked by all send paths).
- **Organizations:** outreachOrganizations vs rcapRevenueAccounts unlinked; prospect promotion is a one-way copy.
- **Timeline:** per-module event ledgers; no per-contact or cross-module view; `rcapRevenueEvents` and `outreachReplies` exist but nothing writes them (Stubbed).
- **Agent runs:** `heartbeatRuns`/`leeRuns`/`prospectDiscoveryRuns` have zero UI — there is no "what did the machine do overnight" view anywhere.

## 14. Recommended first PR — **this branch** (`command-center-phase0-trust`)

Webhook hardening + observability + display truth (built and verified this run):
- ECDSA signature verification, fail-closed when configured; scoped webhook writes (`writeCollections` on both stores, JSON-wipe guard); `sendgridWebhookHealth` singleton + plain-English posture/warnings on `/api/reactivation/status`; store `writeHealth()` on `/api/health/supabase` + reactivation status; `wave_released_at` display-truth fix; 17-check test suite registered in `check`/`test` chains; env documented.
- **Merge, then Render Manual Deploy → promote. Then set `SENDGRID_WEBHOOK_PUBLIC_KEY` in Render env and verify per §18.**

## 15. Recommended second PR — Deploy/version truth + honest posture strings

1. A version-truth check surfaced on Today/System-health: running commit vs repo main, `deployedAt`, "Production behind" warning (data already at `/api/version`; add UI + optional GitHub compare).
2. Replace hardcoded "Email sending: Off" strings with values derived from the status endpoints (the UI already has fetch patterns for `/api/health/supabase`).
3. Registration hygiene: add the 13 never-checked scripts to `npm run check`; fold the 63 orphaned test files into the chain (or an explicit `test:extended`); move `test-soc2-export` off the front of the chain so one env-dependent test stops blocking 70 pure ones.

Then Phase 1 (Queue + Today page) per the architecture blueprint.

## 16. Do-not-touch-yet list

- **Gates & sends:** `REACTIVATION_LIVE_SEND`, `OUTREACH_LIVE_SEND`, `PROSPECT_LIVE_DISCOVERY`, all `ENABLE_LIVE_*_POSTING`, autopilot toggles, wave releases, campaign holds — operator decisions, not build tasks.
- **Legal surface:** packet templates, state rules, legal content, privacy/terms pages.
- **Payment/refund behavior** (Stripe stays read-only).
- **The nav/page structure** — no deletions; Phase 1 is additive (existing pages become drill-downs).
- **The outbox model** — Phase 14; don't half-build it inside the webhook path now.
- **`lib/storage/` alternate Postgres path** — unused by the active store; leave alone.
- **Demo/seed data and flush scripts** — history shows resurrection gotchas.

## 17. Verification commands run (this session)

```
# Live prod (read-only + one idempotent no-op):
curl GET  https://legalease-command-center-prod.onrender.com/api/version
curl GET  …/api/reactivation/status            (owner token)
curl POST …/api/outreach/webhooks/sendgrid     (no-op probe event)
curl POST …/api/heartbeat/autopilot            (idempotent: enabled:false → still false)  [earlier this session]

# Local:
npm run check
node scripts/test-sendgrid-webhook.mjs         (new, 17 checks)
node scripts/test-reactivation-os.mjs · test-outreach-os.mjs · test-supabase-store-pagination.mjs
node scripts/test-supabase-reconcile-write.mjs · test-state-integrity.mjs · test-heartbeat.mjs · test-env-contract.mjs

# Local end-to-end (real server boot, temp JSON store):
POST /api/outreach/webhooks/sendgrid  (no key → processed, verified:false; health persisted; unrelated state intact)
POST /api/outreach/webhooks/sendgrid  (key configured: valid sig → 200 verified:true; missing sig → 401; tampered body → 401)
GET  /api/reactivation/status         (webhook + writeHealth blocks present)
GET  /api/health/supabase             (writeHealth present)
```

## 18. Verification results

- All listed local commands: **PASS** (check PASS; 8/8 test suites PASS; e2e behaved exactly as specified above).
- Full `npm test` **not run**: `test-soc2-export` (first in chain) requires hosted auth env absent in this Codespace — pre-existing, documented condition; all affected pure suites were run standalone instead.
- Prod probes: results in §4 (stale commit; write failures reproduced; campaign posture captured).
- **Post-promote verification checklist (for Roger / next run):**
  1. `GET /api/version` → commit = merged HEAD.
  2. POST a no-op probe to the webhook → expect `{"ok":true,"processed":1,…}` (no ON CONFLICT).
  3. SendGrid dashboard → Event Webhook: enabled, URL = `https://legalease-command-center-prod.onrender.com/api/outreach/webhooks/sendgrid`, events: Delivered/Bounced/Dropped/Spam/Unsubscribe/Group Unsubscribe/Clicked; "Test Integration" → `processed > 0`.
  4. Set `SENDGRID_WEBHOOK_PUBLIC_KEY` in Render env → probe without signature now returns 401.
  5. `GET /api/reactivation/status` → `webhook.lastOkAt` set, counters climbing, `writeHealth.lastWriteOkAt` fresh.
  6. Run the bounce backfill for Wave 1 history.

## 19. Unknowns and how to verify them

| Unknown | How to verify |
|---|---|
| SendGrid dashboard webhook config (URL/events/enabled) | Dashboard check or `GET /v3/user/webhooks/event/settings` with the API key (§18.3) |
| Wave 1 true delivered/bounce outcomes | Backfill via Suppressions API + SendGrid stats UI; delivered counts may be partly unrecoverable |
| Whether prod heartbeat persisted plan snapshots during the write breakage | After promote: `GET /api/heartbeat/status` recent-runs ledger |
| GitHub main vs prod drift going forward | Second PR's version-truth panel; until then: manual `/api/version` vs `git log` |
| Real PostgREST behavior of scoped writes at prod scale | `verify:production` + watch `writeHealth` after promote |
| Whether `COMMAND_CENTER_CRON_TOKEN`-driven ticks succeeded through the outage | Render cron logs |
