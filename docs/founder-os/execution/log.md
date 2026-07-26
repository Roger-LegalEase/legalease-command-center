# Founder OS execution log

Running record of the Releases 1–6 execution against `docs/founder-os/`. Newest entries at
the bottom of each section. Every claim here is backed by a tool result recorded in the
same entry; anything unverified says so.

Precedence when code and ledger disagree: **code wins for facts, the ledger wins for
decisions.** Conflicts are recorded in the "Authority conflicts" section rather than
resolved silently.

---

## Step 0 — clear PR #120

**Status: COMPLETE.**

- Three CI jobs were red on `e45f558` (browser, extended, Phase 8) while local was green.
  Diagnosis and fixes are in PR #120's body and in commits `3114843` and `c0385fd`.
- Root causes, one per job:
  - **extended** — the legacy-shell source hash is pinned in **eleven** test files, not the
    two the first commit updated, and the pinned value predated a later refactor. Local
    `npm test` never runs the 180 extended-only suites, which is why local was green.
  - **Phase 8** — the vNext client-JavaScript ceiling. Merge-base measured 1,649,086 bytes
    against a 1,650,000 ceiling (914 bytes of headroom); the branch added 7,716. The
    ceiling was **not** raised; 7,937 bytes were reclaimed instead.
  - **browser** — axe reported a serious colour-contrast violation (white on the teal
    accent, ~3:1) on the two `.primary` buttons in the reactivation control card. Those
    buttons only entered an audited surface because the branch made the vNext Outreach page
    carry the control card instead of deleting it.
- Verified with CI's own methodology on an unloaded machine: extended failure set on the
  merge-base = 30, on the branch = 30, zero added, zero removed.
- **Merged by Roger** as `1a3d6b7` at 2026-07-25T21:58:58Z (not by this run).
- **Deploy verified**: `GET /api/version` on production returns
  `commit: 1a3d6b7cd6683b77a8a9bc62964dc7724b18b412`, `supabaseState: "connected"`,
  `supabaseConnected: true`, `authProtected: true`, `liveGatesCount: 0`.

---

## Step 0.5 — the release pipeline

**Status: built, verified against live production, PR open.**

Four pieces, all read-only against production:

1. **`scripts/post-deploy-verify.mjs`** — polls `GET /api/version` until the deployed commit
   matches the merged sha (fifteen-second interval, ten-minute ceiling), then asserts
   `supabaseState: "connected"`, `supabaseConnected`, `authProtected`, `noSecretsExposed`,
   `GET /api/health` is `ok`, and that `/` plus every primary workspace route returns 200
   and serves the app shell. Prints `POST_DEPLOY_EVIDENCE` with every observed value and
   fails with a list of the exact mismatches.
   - **Verified live** on `1a3d6b7`: deployed commit matched, `supabaseState: "connected"`,
     all five routes 200 and serving the shell.
   - It deliberately does not claim to prove client rendering. The workspace routes are
     hash routes, so the server returns the same shell for all of them. Client rendering is
     proven pre-merge by the Chromium acceptance specs in the `browser` required check.
2. **`.github/workflows/post-deploy-verification.yml`** — job name `post-deploy
   verification`, deliberately distinct from the pre-merge check `Phase 8 / production
   verification`. Triggers on `workflow_run` of `test` completing successfully on main,
   which is the same signal Render's "After CI Checks Pass" auto-deploy uses.
3. **Auto-revert** — on failure it opens a revert pull request, labels it `auto-revert`,
   enables auto-merge, and then fails loudly so the run stops. See the lesson
   `auto-revert-needs-a-non-default-token.md`: without a non-default token the revert
   pull request cannot run its own checks, so it is opened and labelled but needs Roger to
   merge it. Either way the run stops.
4. **`scripts/founder-os-soak-check.mjs`** — a release may only merge once the previous one
   has been the deployed commit, connected, and serving every route for at least two hours.
   Reads the landing time from `git log` and re-runs the identical assertions.
   - **Verified live** on `1a3d6b7`: correctly refused at `0.20h` elapsed against a 2h
     requirement while reporting everything else healthy.

Acceptance scenarios as Chromium specs need no new plumbing: `playwright.config.mjs` sets
`testDir: ./tests/browser`, so any spec added there runs inside the `browser` required
check. PR #120 proved this — its two new specs ran in CI's browser job. Per-release
fixture servers with the release feature flag enabled are wired in the release that
introduces the flag, starting with Release 1.

---

## Client JavaScript budget ledger

The ceiling is `initialClientJavaScriptBytes: 1_650_000` in
`scripts/vnext-performance-contract.mjs`, enforced by the Phase 8 check. It is a
first-class design constraint for every release. Never raised silently.

| Point in time | Bytes | Headroom | Source |
|---|---|---|---|
| Merge-base of PR #120 (`e4c5728`) | 1,649,086 | 914 | measured, PR #120 |
| PR #120 as first pushed | 1,656,786 | −6,786 (red) | measured, PR #120 |
| PR #120 as merged (`1a3d6b7`) | 1,649,779 | 221 | measured, PR #120 |

---

## Authority conflicts (code vs ledger)

### 2026-07-25 — the `#outreach` alias could not be a registry alias

**Conflict.** The mission requires an alias so `#outreach` never silently renders Today.
The single source for aliases is the route registry in `scripts/ui/navigation.mjs`, and
`scripts/test-vnext-route-inventory.mjs` requires every live alias to be documented in
`docs/ux-vnext/legacy-alias-map.md`. But `00_READ_ME_FIRST.md` declares the whole of
`docs/ux-vnext/` historical and says plainly: "Do not edit those files. They stay as
history."

**Resolution, and why.** The charter wins on decisions, so the historical file was not
edited. The redirect was added instead as a separate, explicitly named contract field —
`compatibilityAliases` in `scripts/ui/route-compatibility.mjs` — consulted at resolution
time but deliberately not counted as a registry alias. `#outreach` now resolves to the
Campaigns page; the registry totals stay 75 canonical routes and 53 aliases, so the
inventory test and the historical alias map remain true. The inventory test gained
assertions proving the behaviour rather than the count.

**Residual.** A reader of `legacy-alias-map.md` will not find `outreach` listed. That is
correct: it is not a product route alias, it is a compatibility redirect for a hash that
only exists when the vNext Outreach page is enabled.

---

## Checkpoints raised

None raised yet. The Press lane build-or-defer question fires at Release 4.

---

## Release 1 — the simplified shell

**Status: built, tests green locally, waiting on the soak gate before merge.**

- `FOUNDER_OS_SHELL` (new, default off) collapses primary navigation to exactly Today,
  Relationships, Campaigns, Scoreboard. Verified by rendering the real shell under both flag
  states: off gives the current eleven-item navigation, on gives exactly four workspaces,
  and with the vNext Outreach page enabled Campaigns points at `#outreach` instead of
  `#campaigns`.
- Global controls are unchanged and already match the charter: Search and Create in the top
  bar, Le-E and Settings in the secondary navigation.
- **Settings → Advanced** renders the fifteen machinery routes from
  `FOUNDER_OS_ADVANCED_ROUTES` behind `data-founder-os-advanced`. It is emitted server-side,
  so with the flag off it contributes zero client bytes.
- **`#outreach` no longer silently renders Today** — see the authority conflict above.
- **Hide now** treatments applied to the five toast-only buttons the deprecation ledger
  names (Edit Priority, two Mark Done, Move to Tomorrow, Resolve Blocker). Verified present
  with the flag off and absent with it on. Gating is server-side, so hiding also reclaims
  client bytes.
- **Dead code removed**: `campaignsPageHtml` (37 lines, 4,447 bytes) had exactly one
  occurrence in the repository — its own definition — and was never called. The live
  Campaigns route renders `campaignsControlPageHtml`.
- The eleven legacy-shell hash pins were recomputed together and annotated with the reason.

### Release 1 client JavaScript budget

Measured by booting the real server with every vNext product flag enabled and summing the
inline `<script>` bodies, the same method the Phase 8 contract uses.

| Build | Bytes | Headroom | Change vs main |
|---|---|---|---|
| main (`b1dac79`) | 1,649,779 | 221 | — |
| Release 1, `FOUNDER_OS_SHELL` off | 1,645,452 | 4,548 | **−4,327** |
| Release 1, `FOUNDER_OS_SHELL` on | 1,648,118 | 1,882 | **−1,661** |

The release ships fewer bytes in both states. The ceiling was not touched.

---

## Release 2 — the Today operating loop

**Status: built, unit and browser tests green locally, extended parity exact. Not merged.**

- `FOUNDER_OS_TODAY` (new, default off) turns Today into the charter's five-section ordered
  work queue — Now, Next, Communications, Meetings, Needs attention — ranked by the six rules
  in `workspaces/today.md`. Off restores the legacy Today page exactly; that is the rollback.
- **The ranking is a projection, not an engine.** `scripts/ui/view-models/founder-today-view.mjs`
  reads the same candidates the inbox view already produces, plus `meetingBriefs`, `alerts` and
  the `queueItems` spine. It classifies each item into one of the six tiers, keeps declared
  priority and derived urgency as separate reported values, and multiplies them for the sort.
  Nothing new is computed, stored or scheduled.
- **Only work that needs Roger today is ranked.** A commitment due next month and a task due in
  September do not appear at all. Tier 6 qualifies only when the item is due today or overdue.
- **The universal action panel is the existing task workbench and communication composer.**
  Both were already built and already lazy-loaded on the Today route by the vNext asset loader;
  they were reachable but nothing on Today opened them. Today now emits the trigger attributes
  they already bind to (`data-task-open`, `data-compose-source-kind`). No panel was rebuilt, and
  the client-JavaScript cost of wiring them was zero because they are served as separate runtime
  files, not inline.
- **The six-part cascade is one action.** Five of the six things the charter names were already
  performed by `markCommunicationDraftSentManually`: record the interaction, complete the task,
  update last-contact, flag the queued automation, set the next follow-up. The sixth — the item
  leaving Today — was missing, because nothing closed the queue item. It now transitions the
  queue items whose `sourceRef` points at the draft's own source or at the task the draft
  completed, through the existing `transitionQueueItem`, and never touches anything else.
  Completing a task from the panel does the same. Both are **opt-in** (`completeQueueItems`),
  passed only when the flag is on, so the flag-off behaviour is byte- and effect-identical.
- **Safety.** Today drafts and records; it has no send path. The cascade still reports
  `externalActions: 0`, still writes `emailSentByApplication: false`, and the Gmail handoff is
  still a link Roger clicks himself. No gate function was changed, added or bypassed.

### Routes superseded, and the ones deliberately left alone

The five daily-loop renderers the deprecation ledger lists under **Consolidate → Today**
(`cockpitHomeHtml`, `focusPageHtml`, `morningBriefPageHtml`, `eveningReflectionPageHtml`,
`dailyCloseoutPageHtml`) are now server-side conditionals. With the flag on they render a short
pointer into Today; with it off they render their original source. Every address still resolves.

`tasksPageHtml`, `meetingsPageHtml`, `supportPageHtml`, `alertsPageHtml`,
`automationInboxPageHtml`, `growthInboxPageHtml` and `milestonesPageHtml` were **not** gated.
The ledger lists meetings, support, alerts, automation and growth-inbox under *Contextualize*,
and rows 50–51 mark meeting briefs and the support desk **Keep**; tasks views and milestones
offer management actions Release 2's panel does not yet replace. Gating them would have hidden
a surface before its parity requirement passed, which the charter forbids. That reclaim is
available to a later release once the panel covers those actions.

### Release 2 client JavaScript budget

Same method as Release 1: the real server, every vNext product flag enabled, summing inline
`<script>` bodies.

| Build | Bytes | Headroom | Change vs Release 1 |
|---|---|---|---|
| Release 1 (`f66f51e`) | 1,647,552 | 2,448 | — |
| Release 2, `FOUNDER_OS_TODAY` off | 1,647,552 | 2,448 | **0 — byte-identical** |
| Release 2, `FOUNDER_OS_TODAY` on | 1,624,079 | 25,921 | **−23,473** |

The flag-on build is smaller than the flag-off build because it ships one Today renderer instead
of two and replaces 21,771 bytes of daily-loop renderers with a single pointer function. The
ceiling was not touched.

### Tests

- `scripts/test-founder-os-today.mjs` (new, in the `npm test` chain): 29 checks over the six
  ranking rules, the "today only" qualification, the 14-day resurfacing rule, the section
  composition, and each of the six cascade steps individually, plus the flag-off no-op path.
- `tests/browser/founder-os-release-2.spec.mjs` (new): the four delivery-plan acceptance
  scenarios in real Chromium, plus a route-parity spec and a rollback spec.
- The eleven legacy-shell hash pins were recomputed together and annotated with the reason.
- One assertion in `scripts/test-vnext-quick-capture.mjs` was corrected with the reason inline:
  it counted "Open Quick Capture" once per file, and `today-page.mjs` now holds two renderers.
  It is asserted once per renderer instead.
- Extended parity against `founder-os-release-1`: 30 failures on both branches, identical lists,
  zero added.

### Recorded finding

Recording a reply to a support issue does **not** remove it from Today, and should not: the
composer deliberately does not close a support case, because the customer's problem is resolved
by a separate judgement. The acceptance scenario for "completing the Now item promotes the next"
uses two inbox follow-ups for that reason.
