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

---

## Refresh 2026-07-25 — re-grepped at `fdbc334`

Re-derived at HEAD `fdbc3341e50500a643dec35a89844a7fe9dd62ac`. Everything above is
preserved as collected at `a3793c3`; this section carries the current line numbers, the
new findings, and the resolutions.

### A. TODO / FIXME / HACK grep — still clean

`grep -rn "TODO\|FIXME\|HACK"` across `lib/`, `scripts/`, `src/`, and root `*.mjs`
returns exactly **one** hit at HEAD, the same assertion-of-absence as before:
`scripts/test-vnext-ui-primitives.mjs:254`. The one intentional lowercase data field is
still `scripts/operator-pulse-feeders.mjs:59` (`todo: "Add cash + burn to compute."`
when cash/burn inputs are absent) — an honest null, not a marker.

### B. Confirmed stubs / no-ops — all 10 STILL OPEN, re-pinned

Behavior is unchanged; only line numbers moved (PRs #113–#118 inserted code both above
and below these sites, so the offsets differ by region).

| # | Item | a3793c3 | HEAD fdbc334 | Behavior at HEAD |
|---|---|---|---|---|
| 1 | Cockpit standup "Edit Priority" | `:24142` | `preview-server.mjs:24190` | `toast('Priority edit saved internally for Roger review.')` — no mutation |
| 2 | Cockpit standup "Mark Done" (Top 3) | `:24143` | `:24191` | toast only |
| 3 | Cockpit standup "Move to Tomorrow" | `:24144` | `:24192` | toast only |
| 4 | Needs Attention "Mark Done" | `:24171` | `:24219` | toast only |
| 5 | "Resolve Blocker" | `:24190` | `:24238` | toast only |
| 6 | Blockers "Move to Tomorrow" | `:24192` | `:24240` | navigation to `#daily-closeout` only |
| 7 | Guided-queue "Mark waiting"/"Mark done" (judgment follow-up mode) | `:20034`, `:20036` | `:20082`, `:20084` | toast only in this mode |
| 8 | SendGrid "Test" button | `:25612`, `:25628` | `:25660` | `toast('SendGrid test is not wired in this pass.')` |
| 9 | RCAP connection placeholder | `:20904–20929`, `:34918`, rendered `:25743` | `:20952–20977` (literal "This is only a placeholder…" at `:20977`), handler `:34972`, rendered `:25791` | Static checklist; button opens/scrolls + toast, no I/O |
| 10 | Wilma placeholder image generation | `:3777`, `:3799`, `:3854–3857`, `:3904` | `wilmaPlaceholderPreviewDataUrl` at `:3784`, literal "Local placeholder only…" at `:3806`, `imageStatus:"local_placeholder"` at `:3863`, card at `:20772`; real OpenAI path with `ALLOW_LOCAL_IMAGE_FALLBACK` at `:12118` | Inline SVG data URL stored as the "generated" image |

The contrast proving items 1–7 are a split rather than a global gap still holds: the real
mutation path is `markTaskDone(id)` (`preview-server.mjs:34081`), Task Detail buttons call
real handlers (`:22766`), operator-search safe actions use real `task_mark_done`
(`:25114`).

### C. NEW findings at this HEAD

#### N1. Campaign detail route wedges the browser main thread — `#outreach/campaign/<id>`

**Severity: this is not a slow load; the tab freezes showing the loading state.**

`scripts/ui/pages/campaign-detail.mjs:39` installs an unguarded observer:

```js
new MutationObserver(()=>{if(route()&&!document.querySelector("[data-campaign-detail]"))load();})
  .observe(document.documentElement,{childList:true,subtree:true});
```

and `load()` (`:38`) begins by destroying whatever is in the host and writing the
loading state:

```js
host.replaceChildren(text("p","Loading Campaign…","campaign-detail-state"));
```

The sentinel `[data-campaign-detail]` only exists **after** a successful render, so while
loading it is absent. `load()`'s own `replaceChildren` is a `childList` mutation on the
observed subtree → the observer fires → the guard passes (on a Campaign route, no
sentinel) → `load()` runs again, aborts the in-flight fetch, and rewrites the loading
state → another mutation. Observer callbacks are microtask-scheduled, so this never
yields: the fetch is aborted every cycle and the page never renders.

**Verified, not inferred.** The shipped `campaignDetailBrowserSource()` string was run in
a real Chromium page (Playwright) with a stubbed route resolver, a healthy stubbed
endpoint returning a valid `available:true` payload, and the DOM the shell provides
(`main#app #item.page-section.active`). A/B against the identical source plus a
one-line re-entrancy guard on the observer callback:

```
A shipped  : MAIN THREAD DID NOT RESPOND within 8s
B guarded  : RESPONSIVE  loads=2 rendered=false text="Loading Campaign…"
```

Because A reproduces with a healthy backend and a valid payload, this is **not** a data
problem, a permissions problem, or a Supabase problem. Comparable surfaces guard the same
pattern — `social-home.mjs:228` and `automation-control-center.mjs:254` use an
`observerQueued` latch; `outreach-home.mjs:206` is unguarded but safe because its
sentinel `[data-outreach-page]` is server-rendered and survives loading. Campaign detail
has neither protection.

`scripts/ui/pages/campaign-wizard.mjs:62` (`new MutationObserver(()=>{if(route()&&!root())activate();})`)
has the same unguarded shape; whether `activate()` can clear `root()` was **not**
tested — recorded as unverified, not as a second confirmed defect.

#### N2. Campaign detail Pause/Resume can never appear — unregistered collection

`scripts/campaign-detail-service.mjs:12` computes capabilities from
`state.campaignActionPolicies`:

```js
const policy = list(state.campaignActionPolicies).find(...) || {};
... capabilities:{ pause: campaign.status.key==="active" && policy.pause===true,
                   resume: campaign.status.key==="paused" && policy.resume===true, ... }
```

`campaignActionPolicies` is **not** in `coreStateCollections` (135 registered collections
at HEAD; verified by import) and is **not** in `OUTREACH_READ_COLLECTIONS`
(`scripts/outreach-api-integration.mjs:37–65`), so `state.campaignActionPolicies` is
always `undefined`, `policy` is always `{}`, and both capabilities are always `false`.
The buttons are rendered only when the capability is true
(`scripts/ui/pages/campaign-detail.mjs:23`), so they can never render. The server-side
`status_action` handler (`outreach-api-integration.mjs:390–394`) is real, but nothing in
the product can reach it. Dead by construction, not by flag.

#### N3. Outreach list "Unavailable" fields are honest, not broken

`scripts/ui/pages/outreach-home.mjs:109` renders the literal `Unavailable` whenever a
projected field is null. Which fields go null is determined by the projection, and the
two campaign source kinds behave differently by design:

- **Canonical `campaigns` rows** project audience only from fields on the row itself —
  `recipients`, `audienceSummary`, `recipientCount`, `excludedRecipientCount`
  (`scripts/ui/view-models/campaign-view.mjs:158–172`). Nothing links a canonical row to
  a contact collection, so a descriptive ledger row shows `Unavailable` for Audience,
  Replies, Next send, and Outcome.
- **The reactivation singleton** projects audience from live contacts —
  `relatedAudience` counts `reactivationContacts` and subtracts the computed exclusions
  (`:174–186`), so it shows real numbers.

`Unavailable` therefore means "this record has no such field", not "the system failed to
load it". That is honest, but at list level the two kinds are indistinguishable, which is
what makes the same campaign look like two campaigns (see N4).

#### N4. One campaign, two rows — the projection merges without deduplicating

`collectCampaignSourceContexts` (`scripts/ui/view-models/campaign-sources.mjs:262–271`)
concatenates canonical rows, partner-outreach rows, and the reactivation singleton with
no cross-kind dedupe. So the live reactivation campaign appears twice in the Outreach
list: once as the canonical `campaigns` row and once as the engine singleton. Details in
the PR body answer (c) and in the reuse-ledger addendum.

#### N5. Storage-layer 503s are now a real UI condition (PROPOSED, no defect found)

The mutation executor can reject a write **before any network call** with
`SUPABASE_WRITE_QUEUE_SATURATED` or `SUPABASE_WRITE_QUEUE_EXPIRED`, both `status: 503`
(`scripts/storage.mjs:628–647`). This is correct load-shedding, and it is deliberately
never retried (a timed-out mutation may already have committed). No surface was audited
for how it presents a 503 save. Recorded as an open question for the Founder OS surfaces,
not as a defect at HEAD.

### D. Resolved since the audit-era inventory

| Item | Status | Evidence |
|---|---|---|
| Publish Now per-channel live gate | **RESOLVED 2026-07-24** (PR #113, merged `9983c95`) | `preview-server.mjs:5857–5861`; `publish-now-gate-review.md` |
| Scheduled-publishing test on removed static-token auth | **RESOLVED 2026-07-24** (PR #114, merged `0bb28a5`) | `scripts/test-scheduled-publishing.mjs` |
| `supabaseConnected: false` in production | **RESOLVED 2026-07-25** | `2026-07-25-production-verification.md`; `/api/version` reports `supabaseConnected: true`, `supabaseState: "connected"` |
| Automatic Discovery Analytics write on every route change | **RESOLVED 2026-07-25** (PR #118) | `src/server/controllers/discovery-analytics-controller.mjs`; `tests/browser/passive-boot-write-free.spec.mjs` asserts a passive load performs zero durable writes |
| Denial audit rewriting the whole `soc2AuditLogs` array per denied request | **RESOLVED 2026-07-24** (PR #116) | single budgeted `claimCollectionItems` insert; `2026-07-25-delta.md` §1 |
| Non-persistent folder creation (Files) | Still FIXED | `scripts/ui/global-create.mjs:169` |
| Unconnected revenue/signup metrics | Still FIXED | honest source-status labels |

### E. Orphan test check — refreshed counts

| Measure | a3793c3 | HEAD fdbc334 |
|---|---|---|
| `scripts/test-*.mjs` files (top level) | 279 | **283** |
| Referenced anywhere in `package.json` scripts | 211 | **214** |
| Referenced nowhere in `package.json` | 68 | **69** |

Four new suites arrived with the perf arc — `test-supabase-backoff.mjs`,
`test-hydration-bounds.mjs`, `test-supabase-mutation-serialization.mjs` (all three added
**to the strict `npm test` chain**) and `test-publish-now-live-gate.mjs` (extended-only).

**Correction to the a3793c3 accounting.** The earlier section reads "212 referenced by
`package.json`; 67 unreferenced by the primary gate". Two distinct measures were conflated
there, and neither equals what the extended runner actually computes:

- `scripts/run-extended-tests.mjs:25–26` builds its "main chain" set by regexing
  **`scripts.test` only** — not the `npm run test:*` sub-scripts that `scripts.test`
  invokes, and not the ~110 standalone `test:*` scripts. At HEAD that set is **103**
  files, so the runner treats **180** files as extended.
- Counting every `scripts/test-*.mjs` string anywhere in `package.json.scripts` gives
  **214** at HEAD (211 at a3793c3) — the number the original section reported.

Consequence: the runner re-runs a large number of tests that other `package.json` scripts
already reference, and the honest statement of the gap is that **179 test files are not
reachable from `npm test`** (transitively, following `npm run`), of which 69 are
referenced nowhere at all. The ledger convention is unchanged: where a capability's only
focused test sits outside the strict gate, production trust is "Partially verified".
