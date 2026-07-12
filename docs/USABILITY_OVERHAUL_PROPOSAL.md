# Usability Overhaul — Design Proposal (awaiting Roger's approval)

Date: 2026-07-12. Status: **PROPOSAL ONLY — nothing built.** Build starts only after Roger approves.

Success test (Roger's words): *can Roger do his whole morning routine without asking anyone
what a button does.*

---

## 0. What the investigation found (evidence, measured 2026-07-12)

### Latency — measured on prod

| Request | Time | Note |
|---|---|---|
| `GET /api/version` (no state read) | 0.25–0.28s | proves network + Node are fine |
| `GET /api/health` (one state read) | 3.3–5.0s cold, 1.4–1.6s warm | the cost of ONE `readState()` |
| Same endpoints on local JSON copy of prod-sized state | < 0.09s | code is fast; Supabase round-trips are the cost |
| App shell `GET /` | 1.4 MB HTML | one giant inline script |
| `GET /api/state` | 510 KB | client re-pulls after actions |

### Why (from code)

1. **No cross-request state cache.** `SupabaseCoreStore.readState()` (`scripts/storage.mjs:744`)
   pages the entire `leos_core_records` table (~13.6k rows, ~14 round-trips, ~3s) on EVERY
   request that touches state. 236 `store.readState()` call sites in the server. The
   single-flight dedupe (`_readInFlight`) only helps exactly-concurrent readers and is
   nulled the moment it settles.
2. **Per-request projector rebuild.** `/api/queue`, `/api/approvals/decide`,
   `/api/today/summary` re-run `projectCompanyMemory()` (`scripts/company-memory-projector.mjs:567`)
   over all contact/org ledgers on top of the full fetch.
3. **Writes pay the full fetch twice.** `writeStateToSupabase()` (`scripts/storage.mjs:807`)
   upserts, then does a SECOND full-table fetch to reconcile orphans + per-row deletes —
   all serialized behind one global mutation lock (`serializeStateMutation`,
   `preview-server.mjs:7969`). One button click = read full table + write + read full table.
4. **Live metrics block hot GETs.** `fetchLiveMetricsSnapshots()` (Stripe + signups, 8s aborts)
   is awaited inside `/api/state` and `/api/today/summary`; the 60s cache is dropped on any
   soft failure, so an outage re-costs 8s per request.
5. **Zero click feedback.** Of ~650 onclick handlers / 693 buttons, exactly 2 show any
   in-flight state (image generation, Le-E send). `toast()` fires only AFTER the fetch;
   every action ends in a full `#app` innerHTML teardown re-render, and most actions
   re-fetch summaries and/or the 510 KB state.

### Navigation — measured

- 8 top-nav items fan out to **~90 hash-routed pages**; 8 pages (`#alerts`, `#revenue`,
  `#meetings`, `#upload`, `#contacts`, `#prospects`, `#support`, `#pages`) are reachable
  ONLY by knowing the hash — they are in no nav at all.
- Busiest screens carry 25–61 flat, equal-weight controls (Le-E 61, Proof 55, Growth 45,
  Queue 38+, Content Bank 31).

### Social flow — measured

- A draft passes through 7+ manual stage buttons (Mark Copy Reviewed, Create/Save Image
  Prompt, Generate Image, Confirm Overlay, Mark Image Ready, Final PNG, Approve, Manual Kit).
  Only **Approve** and **Fix/Regenerate** are real human decisions; the rest are ceremony
  flags or steps the server can fire itself (precedent: `runSourceAutomation`,
  `preview-server.mjs:9594`, already auto-renders images with no click).
- All three quality gates (guidelines §2/§3 copy gate, style gate, render QA §6) already run
  automatically. **The guidelines gate result is stamped on every draft but never rendered**
  — a failing draft looks approvable until Approve throws a raw engineer string
  ("Guidelines hard fail - cannot approve: voice_em_dash …").

### Outputs — measured

- The shared queue-card **Open** control (`ckOpenControlHtml`, `preview-server.mjs:27074`)
  can only navigate to a bare page hash. Every projector hardcodes `sourceLink` to a section
  list (`#queue`, `#campaigns`, `#support`…). Yet every queue item ALREADY carries
  `sourceRef: {collection, itemId}` (`scripts/company-memory.mjs:143`) — the deep link
  exists in the data and is thrown away by the link model (`normalizeSourceLink`
  structurally rejects anything richer than `#route`).
- Dead ends: `codebaseHealthSnapshots` and `engagementGrowthSnapshots` have endpoints the
  client never calls and no page renders; exported weekly reports show their file path as
  non-clickable text with no download route; `docs/reports/*.md` have zero app surface;
  Today's "Drafts ready" and "Meetings" modules are plain text with no links.

---

## 1. The new Today-morning experience (plain English, screen by screen)

### Screen 1 — Today (the app opens here, and it paints in under a second)

Top of screen, one line: the date and one sentence of system truth — "All systems normal.
Heartbeat ran at 7:00. Nothing is on fire." (Or, if something IS wrong: one red sentence
that says what, in words, with the one button that opens it.)

Below that, three blocks, in the order of Roger's morning:

1. **"Overnight"** — five plain sentences max: "3 reactivation emails sent, 1 reply came in.
   2 new signups. 1 social draft is ready for review. The weekly report was generated."
   Every sentence is a link that lands ON the thing it describes (the reply, the draft,
   the report) — not on a section.
2. **"Needs you — N items"** — the queue, with the top 3 cards shown inline. One big
   primary button: **Work the queue**. That is the ONLY primary button on the screen.
3. **"Your outputs"** — everything the system produced in the last 24h (posts, images,
   reports, briefs), each one click to open the actual artifact.

There is no cockpit-vs-today split anymore; this IS the landing page.

### Screen 2 — My Queue (press "Work the queue")

One item at a time, like flipping through cards. Each card shows the ACTUAL artifact
inline — the email as it will be sent, the post as it will look, the task text — with
three buttons: **Approve** (primary), **Fix…**, **Skip**. Approve advances to the next
card instantly (the button presses, spins, ticks — the write completes in the background).
A progress line at the top: "4 of 11". When the stack is empty: "Queue clear. Back to Today."
An "all items as a list" toggle exists for scanning, but the default is one at a time.

### Screen 3 — Review Desk (social wizard — replaces every stage button)

One draft at a time. Roger sees the FINISHED thing: rendered image and caption together,
exactly as it would post. Above it, one status line in one of three states:

- **"Ready to approve"** — green. Buttons: **Approve** (primary), **Fix…**, **Skip**.
- **"Needs a fix: [plain English reason]"** — e.g. "The image text doesn't match the
  caption" or "The caption uses a phrase the guidelines ban ('game-changer')". One button:
  **Fix it** — which regenerates the failing piece only, with a spinner, and returns to
  this same card. (A small "details" link shows the raw gate output for debugging.)
- **"Working…"** — caption/image/QA still running server-side; card shows a progress note
  and updates itself. Roger never triggers these stages; drafts arrive here already rendered
  and gated, because generation, image render, style gate and QA all auto-run when a draft
  is created.

Approve does everything the old flags did (copy-reviewed, image-ready, overlay) implicitly.
The old per-stage buttons, chips and the guided workbench modes disappear. Manual override
(edit caption, edit image prompt) lives behind one "Edit…" secondary button.

### Screen 4 — Campaigns

Plain sentences, not dashboards: "Reactivation: paused (incident 7/8 — 138-resend risk).
Outreach: live, 0 sends yesterday, waiting on prospect approvals." One primary action,
context-dependent (e.g. **Review pending prospects**). Everything else is a "details" link.

### Screen 5 — Reports

One page that lists every artifact family the system produces, newest first, each with a
real **Open** (renders it in-app) and **Download**: weekly operating reports, codebase
health, engagement growth, morning briefs, evidence pack, posted content. This wires up the
two dead report endpoints and adds a download route for exported report files. Reachable
from Today in one click (an "Overnight" sentence or the nav).

### Navigation (every screen)

Six items, always visible: **Today · Queue · Campaigns · Review Desk · Reports · More**.
"More" opens a single grouped, searchable index of every other existing page (~85 of them)
— nothing is deleted, every old `#hash` still works, it's just no longer in Roger's face.
One primary (orange) button per screen, everywhere; all other actions are visually secondary.

### Every button, everywhere

The instant any button is clicked: pressed state + disabled + inline spinner (within 100ms,
before any network). Then either the result appears or a readable error appears on the
button itself ("Failed — tap to retry"), not just a 1.8s toast. No click may ever do
nothing visibly. Implemented once, centrally (all handlers already route through one
`api()` helper and one render loop), not 650 times.

---

## 2. Latency fixes (top offenders, in order)

| # | Fix | Where | Expected effect |
|---|---|---|---|
| 1 | Cross-request in-memory state cache keyed on `_writeGen` (invalidate on write; short TTL as safety) | `storage.mjs` `SupabaseCoreStore.readState` | warm reads ~1.5s → ~0ms; benefits all 236 call sites at one stroke |
| 2 | Memoize `projectCompanyMemory()` by `_writeGen` (or serve the heartbeat-persisted projection) | projector call sites | removes per-request full re-projection |
| 3 | Skip the orphan-reconcile second full fetch for singleton/settings-only patches; reuse the cached row index otherwise | `storage.mjs` `writeStateToSupabase` | button-click POSTs stop paying the table fetch twice |
| 4 | Stale-while-revalidate for Stripe/signups metrics; never drop cache on soft failure; never block `/api/state` / `/api/today/summary` on live fetch | `fetchLiveMetricsSnapshots` | removes the 8s-abort cliff from the two hottest GETs |
| 5 | Actions return their updated slice; client patches state in place instead of re-fetching 510 KB + full re-render | `api()` + action handlers | click-to-result on warm path well under 1s |
| 6 | Central button feedback (pressed/disabled/spinner/error-on-button) via event delegation that survives re-render | client shell | no click ever does nothing visibly |

Explicitly NOT doing: schema changes, moving off Supabase, splitting the monolith file.
Target after fixes: every click visibly responds < 100ms; warm actions complete < 1s;
Today first paint < 1s warm.

## 3. Deep links (SHOW ME MY OUTPUT)

- New route family `#item/<collection>/<id>` + one artifact-viewer page that renders any
  record by its `sourceRef` with type-specific renderers (email preview, post card, report
  body, task, contact).
- Extend `normalizeSourceLink` + `ckOpenControlHtml` to carry `{collection, itemId}` —
  the data already exists on every queue item; projectors stop discarding it.
- Wire the dead ends: codebase-health + engagement-growth report pages; download route for
  `data/exports/reports/*`; make Today's "Drafts ready"/"Meetings" lines clickable.
- Acceptance: every report/post/document reachable within two clicks of Today; queue Open
  lands ON the artifact.

## 4. Build plan (after approval — each phase its own PR, gated by npm test in a clean worktree)

1. **Phase L — Latency + button feedback** (fixes 1–6 above). No visual redesign; biggest
   felt improvement first. Includes before/after timings in the PR body.
2. **Phase N — Navigation + new Today.** Six-item nav, More index, Today rebuilt as
   Screen 1, old routes preserved as aliases. Existing layout tests (test-top-nav-layout,
   test-cockpit-layout, test-operator-experience, …) updated in the same PR.
3. **Phase S — Review Desk wizard.** Auto-run render on draft creation (reuse
   `runSourceAutomation` pattern), collapse ceremony flags into Approve, three-state card,
   plain-English gate messages (mapping table from rule ids like `voice_em_dash` to operator
   sentences). Send pipelines and gates themselves are NOT touched — the hard-fail gate
   stays hard.
4. **Phase O — Outputs.** `#item/…` deep links, artifact viewer, Reports page, dead-end
   wiring.
5. **Acceptance pass** — scripted morning-routine walkthrough (the success test), measured
   click-latency budget, screenshots in the PR.

## 5. Decisions Roger needs to make (the only open questions)

1. Approve this proposal overall / with edits?
2. Auto-rendering images on draft creation spends OpenAI credits per draft without a click
   (same render + QA + one retry as today, just automatic). OK?
3. The six nav items are Today, Queue, Campaigns, Review Desk, Reports, More. Anything you
   use daily that must NOT move under More (e.g. Le-E)?
4. Campaign safety unchanged throughout: reactivation stays paused, no send-path behavior
   changes, Approve is always a human click. Confirm that constraint reading is right.
