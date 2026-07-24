# Loose ends — evidence at current HEAD

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

- **Collected at:** `a3793c3156bc2c866dbd1f65e0ec420ae2352554`, 2026-07-23.
- Line numbers verified against current code. `scripts/preview-server.mjs` is the monolith
  holding server code and the client script (template-literal sections render in the browser).

## 1. TODO / FIXME / HACK grep

The tracked codebase is effectively clean of TODO/FIXME/HACK markers. The only hit in
`lib/`, `scripts/`, and root `*.mjs` is a test asserting their **absence** from visible
UI text: `scripts/test-vnext-ui-primitives.mjs:254`
(`assert.doesNotMatch(visibleText, /\b(?:TODO|TBD|placeholder|lorem ipsum|coming soon)\b/i)`).
One intentional lowercase `todo` field exists in data (not a comment):
`scripts/operator-pulse-feeders.mjs:59` emits `todo: "Add cash + burn to compute."` when
cash/burn inputs are absent — an honest-null, not fabrication.

## 2. Stub and no-op inventory

### Confirmed stubs / no-ops (STILL OPEN at current HEAD)

| # | Item | Location | What the code does today |
|---|---|---|---|
| 1 | Cockpit standup "Edit Priority" | `scripts/preview-server.mjs:24142` | `toast('Priority edit saved internally for Roger review.')` — no mutation |
| 2 | Cockpit standup "Mark Done" (Top 3) | `scripts/preview-server.mjs:24143` | `toast('Priority marked done internally...')` — no mutation |
| 3 | Cockpit standup "Move to Tomorrow" | `scripts/preview-server.mjs:24144` | `toast('Priority moved to tomorrow internally.')` — no mutation |
| 4 | Needs Attention "Mark Done" | `scripts/preview-server.mjs:24171` | toast only — no mutation |
| 5 | "Resolve Blocker" | `scripts/preview-server.mjs:24190` | toast only — no mutation |
| 6 | Blockers "Move to Tomorrow" | `scripts/preview-server.mjs:24192` | navigation to `#daily-closeout` only |
| 7 | Guided-queue "Mark waiting"/"Mark done" (judgment follow-up mode) | `scripts/preview-server.mjs:20034`, `:20036` | toast only in this mode |
| 8 | SendGrid "Test" button | `scripts/preview-server.mjs:25612`, `:25628` | `toast('SendGrid test is not wired in this pass.')` |
| 9 | RCAP connection placeholder | `scripts/preview-server.mjs:20904–20929`, `:34918`, rendered at `:25743` | Static checklist; literal "This is only a placeholder. Nothing connects or runs from here yet."; button opens/scrolls + toast, no I/O |
| 10 | Wilma placeholder image generation | `scripts/preview-server.mjs:3777`, `:3799`, `:3854–3857`, `:3904` | Inline SVG data URL stored as the "generated" image with `imageStatus:"local_placeholder"`; literal "Local placeholder only. External image API not connected for this workflow." A real OpenAI path exists separately (`:12060`, `:12079`; local fallback gated by `ALLOW_LOCAL_IMAGE_FALLBACK`, `:12070–12074`) — the dedicated Wilma workflow bypasses it |

Contrast, proving items 1–7 are a split rather than a global gap: the real task mutation
path is wired elsewhere — `markTaskDone(id)` → `updateTaskAction` → task API POST
(`scripts/preview-server.mjs:34033`), Task Detail buttons call real handlers
(`:22715–22723`), operator-search safe actions use real `task_mark_done`/`task_reopen`
(`:25063–25068`).

### Formerly-suspected items now resolved or working as designed

| Item | Status at current HEAD | Evidence |
|---|---|---|
| Non-persistent folder creation (Files) | **FIXED** — replaced with an honestly-disabled deferral: `Create folder` renders `disabled aria-disabled="true"` with copy "Folders are not available in the current Files system yet." | `scripts/ui/global-create.mjs:169`, `:60–61`, `:43`; `scripts/ui/app-shell-navigation.mjs:43–45`; asserted by `scripts/test-vnext-global-create.mjs:25`; no folder-creation handler remains in `preview-server.mjs` |
| Unconnected revenue/signup metrics | **FIXED** — live connectors with SWR caching; remaining "Not wired yet" strings are honest source-status labels, not dead metrics | `scripts/preview-server.mjs:12764` (signups URL), `:12818` (`available:false` when unconfigured), `:12787` (parallel Stripe+signups fetch), honest empty states at `:27207`, `:27872`, `:28057`, `:28080–28081`, `:28144–28151` |
| Review-only imports (consumer list, expungement lifecycle) | **WORKING AS DESIGNED** — records persist and are force-held from any campaign path; the inertness is deliberate safety gating. Labeling gap addressed in the migration ledger | `scripts/consumer-list-import.mjs:1–2`, `:225`, `:239–241`; `scripts/expungement-lifecycle-sync.mjs:1–16`, `:27`, `:31` |
| `publishToChannel` "not implemented" throw | NOT a stub — guard for unknown channels only; all five real channels handled | `scripts/preview-server.mjs:5354–5359` |
| `scripts/ui/labels.mjs` "deliberately not wired" | NOT a stub — self-declared founder-language data module | `scripts/ui/labels.mjs:1–2` |
| "Review only" automation entries | NOT a stub — intentional review-only posture | `scripts/automation-control-center-service.mjs:745`, `:761` |
| Heartbeat/loop "no-op" comments | NOT stubs — documented idempotency/mutex behavior | `scripts/heartbeat.mjs:93`, `:138`, `:159`; `scripts/operating-loops.mjs:13`, `:18`, `:287` |

## 3. Orphan test check

How tests are discovered:

- `package.json:83` — the primary `npm test` gate is a single hardcoded `&&` chain
  invoking ~211 `node scripts/test-*.mjs` files explicitly. No glob discovery.
- `scripts/run-extended-tests.mjs:25–29` (`npm run test:extended`, `package.json:109`) —
  scans `scripts/` for every `test-*.mjs` **not** in the primary chain and runs it.
- CI (`.github/workflows/test.yml:73`, `:87`) — the extended job runs
  `scripts/compare-extended-tests.mjs`, a **differential** gate (fails only on NEW
  failures vs base), not a strict pass/fail.

Counts at current HEAD: **279** `scripts/test-*.mjs` files; **212** referenced by
`package.json`; **67** unreferenced by the primary gate (picked up only by the extended
differential runner). So no test is fully orphaned, but 67 tests — including several that
cover Founder OS-relevant surfaces — sit outside the strict gate:

Notable extended-only tests relevant to this package: `test-founder-scoreboard-api.mjs`,
`test-founder-scoreboard-service.mjs`, `test-founder-scoreboard-ui.mjs`,
`test-founder-company-health-api.mjs`, `test-founder-company-health-service.mjs`,
`test-founder-company-health-ui.mjs`, `test-vnext-relationships.mjs`,
`test-communication-composer-service.mjs`, `test-social-weekly-planner-api.mjs`,
`test-social-weekly-planner-service.mjs`, `test-rcap-connection-placeholder.mjs`,
`test-consumer-list-import.mjs`, `test-expungement-lifecycle-sync.mjs`,
`test-today-standup-page.mjs`, `test-every-visible-button-works.mjs`,
`test-scheduled-publishing.mjs`, `test-social-posting-safety.mjs`, plus OAuth/connector
readiness suites (`test-linkedin-*`, `test-twitter-x-*`, `test-meta-connector.mjs`) and
workspace suites (`test-partners-workspace.mjs`, `test-social-workspace.mjs`,
`test-queue-workspace.mjs`, `test-more-workspace.mjs`, `test-growth-workspace.mjs`,
`test-production-workspace.mjs`, `test-proof-workspace.mjs`,
`test-settings-health-workspace.mjs`, and the remainder of the 67).

Ledger consequence: where a capability's only focused test lives in the extended
differential runner, `../01_CURRENT_STATE_REUSE_LEDGER.md` marks production trust
"Partially verified" rather than "Verified" — the test exists and passes, but the strict
gate does not pin it.
