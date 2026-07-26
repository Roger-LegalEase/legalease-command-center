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
4. **The merge gate.** Originally `scripts/founder-os-soak-check.mjs`: a release could only
   merge once the previous one had been the deployed commit, connected, and serving every
   route for at least two hours. Verified live on `1a3d6b7`, where it correctly refused at
   `0.20h` elapsed.
   - **SUPERSEDED 2026-07-26 by Roger's instruction.** The wall-clock wait is gone; the
     protection is not. `scripts/founder-os-release-gate.mjs` replaces it — see "The merge
     gate, as of 2026-07-26" below. The soak script is deleted so the repository does not
     describe two different gates.

Acceptance scenarios as Chromium specs need no new plumbing: `playwright.config.mjs` sets
`testDir: ./tests/browser`, so any spec added there runs inside the `browser` required
check. PR #120 proved this — its two new specs ran in CI's browser job. Per-release
fixture servers with the release feature flag enabled are wired in the release that
introduces the flag, starting with Release 1.

---

## The merge gate, as of 2026-07-26

**Policy change from Roger, effective 2026-07-26: the two-hour soak gate is removed.** It is
replaced by a faster gate that keeps the real protection. `scripts/founder-os-soak-check.mjs` is
**deleted** and `scripts/founder-os-release-gate.mjs` takes its place, so the repository does not
describe two different rules.

A release may merge as soon as all three of these hold **at the moment of merging**:

| Condition | What it proves | How the gate checks it |
|---|---|---|
| (a) All seven required checks green on the release's own pull request | The release itself is sound | `gh pr checks <pr>`, compared against a named `REQUIRED_CHECKS` list so a narrowed protection set cannot slip through |
| (b) The previous release's post-deploy verification concluded `success` | The previous deploy was actually **verified**, not merely attempted | Newest `post-deploy-verification.yml` run for that sha; a re-run supersedes an earlier attempt |
| (c) A live `GET /api/version` reports the previous release's commit with `supabaseState: "connected"` | That verified deploy is **still** what production is serving | `verifyOnce` — the same assertion set the post-deploy workflow runs, reused rather than restated |

**(b) and (c) are both required, deliberately.** (b) alone would pass for a deploy that has since
been reverted or drifted. (c) alone would pass for a commit that is serving but whose verification
failed or never ran. Together they say: the last release was verified, and it is still live. That
is the property the two-hour wait was a proxy for, established directly instead of by waiting.

Everything else stands unchanged: branch protection, Render's "After CI Checks Pass" auto-deploy,
post-deploy verification, and auto-revert on verification failure — which still stops the run and
reports to Roger immediately.

**Verified live on first use.** Run against PR #128 with Release 3 (`922a555`) as the previous
release, the gate returned `RELEASE_GATE_EVIDENCE` showing post-deploy verification run
`30198784913` concluded `success`, the deployed commit still `922a555…` with
`supabaseState: "connected"`, all five routes 200 — **and refused the merge** because
`extended` was `fail` on the pull request. It caught a genuine problem on its first run rather
than rubber-stamping. (See the hygiene entry: CI's discovery-count guard, not the failure
comparison.)

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
| main at `dc75baa`, all Founder OS flags off | 1,645,452 | 4,548 | measured 2026-07-26 |
| main at `dc75baa`, shell + Today on | 1,624,450 | 25,550 | measured 2026-07-26 |

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

### 2026-07-26 — Release 3's "identity dedup projection" already existed

**Conflict.** `08_DELIVERY_PLAN.md` lists Release 3's projection/adapter as "identity dedup
projection (email/domain keyed, ambiguity surfaced)", written as work to be done. At HEAD
`scripts/relationship-service.mjs` is 2,177 lines that already read all seven identity stores,
already dedupe by email and organization, and are already served in production at
`/api/ui/relationships/` and inside `/api/ui/partners`.

**Resolution, and why.** Code wins for facts, so the projection was **not** rebuilt and no
second projection was created — building one would have violated the reuse ledger's
prohibition on a parallel contact store in the course of satisfying a line that only looked
unmet. What was genuinely absent was verified by direct grep before any code was written:
roles as a set, ambiguity surfacing, the two founder-set fields, support issues in the
timeline, and the charter's filter vocabulary. Release 3 adds exactly those.

**Residual.** The delivery plan's Release 3 row still reads as though the projection is new.
It is left unedited — the charter is authority for decisions and this is a fact correction,
recorded here rather than by rewriting the plan.

---

## Checkpoints raised

1. **2026-07-26 — enable the Release 1 and 2 flags in Render.** Both releases were deployed
   and verified but invisible, because `FOUNDER_OS_SHELL` and `FOUNDER_OS_TODAY` ship default
   off and neither key is in `render.yaml`. Roger was asked what to enable, told what each
   flag changes, that setting it back to `false` is the tested rollback, and which acceptance
   scenarios pass in Chromium for each. **Roger's answer: enable both now, and
   `COMMAND_CENTER_UX_VNEXT` is already true in production** — which matters because
   `FOUNDER_OS_SHELL` is inert without it and this run cannot observe that value from
   outside. The environment change is Roger's; this run did not make it. A flag flip does not
   change the commit `/api/version` reports, so the flip is not externally observable either
   and is treated as unverified until Roger confirms.
2. **2026-07-26 — the Press lane build-or-defer question.** Raised once at Release 4 with an
   estimate of what building it entails. **Roger chose to defer.** The lane ships the charter's
   honest not-built state; Press becomes its own release with its own safety review.
3. **2026-07-26 — production flag state, confirmed by Roger and NOT observable from this side.**
   `FOUNDER_OS_SHELL` true, `FOUNDER_OS_TODAY` true, `FOUNDER_OS_RELATIONSHIPS` true,
   `FOUNDER_OS_CAMPAIGNS` false. Roger confirms the navigation shows the four workspaces and Today
   shows the five sections, so **Releases 1 through 3 are live and working in production**. He
   will enable `FOUNDER_OS_CAMPAIGNS` after Release 4 deploys. Recorded as his observation rather
   than a verification of mine: a flag flip does not change the commit `/api/version` reports, so
   this run cannot confirm it independently.

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

**Status: MERGED as `dc75baa` at 2026-07-26T02:44:46Z. Deployed, verified, soak satisfied.**
(The build notes below were written pre-merge and are preserved unchanged.)

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

---

## Session resume — 2026-07-26 state verification

The previous session's terminal was cut off while Release 2's post-deploy verification was
still running. Every line below is from a tool result in the resuming session, not from
memory or from the notes above.

### Pull requests

| PR | Title | State | Merge commit |
|---|---|---|---|
| #121 | Founder OS pipeline: post-deploy verification, auto-revert, soak gate | MERGED 2026-07-25T22:22:18Z | `b1dac79` |
| #122 | Release 1: simplified shell, Settings → Advanced, outreach redirect | MERGED 2026-07-26T00:23:58Z | `2fcf1c8` |
| #123 | Release 2 (superseded) | CLOSED 2026-07-26T00:54:35Z, `mergedAt: null` | — |
| #124 | Release 2: the Today operating loop and the universal action panel | MERGED 2026-07-26T02:44:46Z | `dc75baa` |

`git log` confirms all three merge commits are ancestors of the current `main` tip
`dc75baa`, in that order, on top of `1a3d6b7` (PR #120).

### Required checks on the merge commits

All nine check runs on both `2fcf1c8` and `dc75baa` report `success`, except
`auto-revert failed deploy` which is `skipped` — the correct state when verification passes.
The seven required checks are `check`, `extended`, `browser`, `canonical`, `security`,
`privacy-and-migrations`, `Phase 8 / production verification`.

### Release 2 post-deploy verification — the question left open

**Conclusion: PASSED.** Workflow run `30185300205` on `dc75baa`, conclusion `success`,
started 2026-07-26T02:54:38Z, verified at 02:55:17Z on the third poll:

```
POST_DEPLOY_EVIDENCE {"expectedCommit":"dc75baa…","deployedCommit":"dc75baa…",
  "supabaseState":"connected","health":{"status":"ok"},
  "routes":{"/":200,"/#today":200,"/#partners":200,"/#campaigns":200,"/#revenue":200,
            all servesShell:true}}
```

No auto-revert was triggered and none was required.

### Production at the time of resume

`GET /api/version` on `legalease-command-center-prod.onrender.com`:
`commit: dc75baa1856716e2111f105c62d5eeee7792b7f6`, `supabaseState: "connected"`,
`supabaseConnected: true`, `authStoreConnected: true`, `authProtected: true`,
`liveGatesCount: 0`, `noSecretsExposed: true`. `GET /api/health` → 200.

### Soak gate (the rule in force at the time)

`node scripts/founder-os-soak-check.mjs --commit dc75baa…` →
**satisfied**, `elapsedHours: 4.895` against `minHours: 2`, deployed commit matching,
Supabase connected, all five routes 200 and serving the shell. Release 3 is free to merge on
the soak gate's terms once its own checks are green.

### Both releases are deployed and invisible

`scripts/ui/founder-os-config.mjs:22–27` and `:76–77` read `FOUNDER_OS_SHELL` and
`FOUNDER_OS_TODAY` from the server environment with strict `value === "true"` parsing, so an
absent key is off. Neither key appears in `render.yaml`, which means neither is set by
infrastructure-as-code and both would have to be set in the Render dashboard. Roger's
checkpoint to enable them was raised at the start of this session.

**One dependency worth recording:** `FOUNDER_OS_SHELL` composes with the vNext shell rather
than replacing it (`founder-os-config.mjs:12–14`) — with `COMMAND_CENTER_UX_VNEXT` off the
flag is inert. No API endpoint reports the vNext flag's value, and an unauthenticated request
to `/` returns the 4,639-byte login page with no shell markers, so **this run cannot observe
whether vNext is on in production.** It is part of the checkpoint question rather than an
assumption.

---

## Release 3 — the Relationships workspace

**Status: built on branch `founder-os-release-3`. Not merged.**

### The finding that shaped the release

`08_DELIVERY_PLAN.md` describes Release 3 as building an identity-dedupe projection. **At HEAD
that projection already exists and is already live.** `scripts/relationship-service.mjs` is
2,177 lines, reads all seven identity stores named in `01_CURRENT_STATE_REUSE_LEDGER.md:53`,
and is served at `/api/ui/relationships/` (wired at `preview-server.mjs:36226`) and inside
`/api/ui/partners` (`partners-home-service.mjs:70`). Code wins for facts, so Release 3 did
**not** build a projection. It extended the one that exists with the charter behaviour it did
not yet have. Nothing was rebuilt and no second projection was created.

Verified absent at HEAD before any code was written, by direct grep:

- `relationshipStrength` / `strategicPriority` — **zero occurrences anywhere in `scripts/`**.
- Ambiguity surfacing — no `ambiguous` / `possibleMatch` / `needsConfirmation` in the service.
- `supportIssues` — absent from both relationship read sets, so the charter's tenth timeline
  source was silently missing.
- Roles — `categoryFor` collapses a person to exactly **one** category; there was no roles set.
- Filters — five quick filters existed against the charter's fifteen, and none of the six
  pinned secondary views from `02_TARGET_PRODUCT_AND_IA.md:37`.

### What the release adds, all behind `FOUNDER_OS_RELATIONSHIPS` (new, default off)

- **Roles are a set on one person.** `rolesFor` unions every declared type across the entity's
  contacts and organizations, using the existing `CONTACT_TYPES` vocabulary from
  `company-memory.mjs` — no second vocabulary. An investor who is also a partner contact and a
  funder is one record with three roles. Types outside the vocabulary are dropped rather than
  displayed as a role with no definition.
- **Ambiguous identity is surfaced, never merged.** `uniqueAlias` already refused to merge on
  an ambiguous alias, but it then *discarded* the ambiguity, so the same person could quietly
  become a third standalone record. Two mechanisms now report it: a per-contact capture for
  the fall-through case, and a whole-graph pass for the commoner and more dangerous one —
  two relationships that each resolved perfectly well by their own explicit link and
  nonetheless claim the same email. Reported on every relationship involved, merged on none.
- **Support issues joined the timeline**, on the **detail** read contract only *and* only when
  the flag is on, so a relationship list does not pay to read a collection it never renders and
  the flag-off detail contract reads exactly what it read before. An open issue reads inbound;
  a drafted or resolved one reads outbound. This is the one place the flag changes an existing
  value: last-inbound now counts a support issue as inbound contact, which it is. That single
  shift is asserted by name in the test suite so it can never happen silently or spread.
- **Relationship strength and strategic priority.** Both founder-set, never inferred. Strength
  is genuinely new and reports "Not set" when unset rather than guessing from activity.
  Strategic priority *extends* the existing partner priority: an explicit value wins, the
  partner's own `priority` is honoured when there is none, and the projection reports which of
  the two it used. Both are written onto the relationship's own canonical source record by the
  same mechanism `updateRelationshipStage` already uses — no new collection, no parallel store.
- **The charter's filters**, plus the six pinned views verbatim from the IA table. Every view
  and saved filter reports the count it would return, and a test asserts the advertised count
  equals the returned count for every one of them. "Overdue" is strictly past due where
  "Follow-up due" includes today, because the charter lists both.
- **Open commitments** from inbox-intelligence commitment signals, with overdue marked —
  the field workflow 05 requires on the unified record.

### Routes superseded

**None.** Release 3 supersedes no route: `partners`, `partner-hub`, `contacts`, `pilots` and
`pages` all still render exactly what they rendered before, and a browser spec asserts it. The
delivery plan permits aliasing them into Relationships only *after* parity, and parity for the
partner sub-pages (programs, dashboards, reports, proposals) means their actions exist on the
unified record. That has not been demonstrated, so nothing was hidden. The reclaim stays
available to a later release.

### Safety

Relationships drafts and records; it has no send path. Every action the release adds is
internal — strength and priority — and both report `externalActions: 0`. No gate function was
changed, added or bypassed. The new query keys are accepted **only** when the flag is on: with
it off they remain unknown keys and the request is rejected exactly as before, deliberately,
because silently accepting a filter the projection will not apply would return a set that
looks filtered and is not.

### Release 3 client JavaScript budget

Same method as Releases 1 and 2: the real server, every vNext product flag enabled, summing
inline `<script>` bodies.

| Build | Bytes | Headroom | Change |
|---|---|---|---|
| main (`dc75baa`), all flags off | 1,645,452 | 4,548 | — |
| Release 3, flag off | 1,645,741 | 4,259 | **+289** |
| main (`dc75baa`), shell + Today on | 1,624,450 | 25,550 | — |
| Release 3, shell + Today on | 1,624,739 | 25,261 | **+289** |
| Release 3, all three flags on | 1,627,800 | 22,200 | **+3,061** vs shell + Today |

The ceiling was not touched. The +289 with the flag off is the payload-shape guard in the
renderer functions that always ship; the +3,061 with the flag on is the five view helpers, the
filter-reset map and the view binding, which ship only when the flag is on.

### A real regression the budget measurement caught

The first measurement reported the flag-on build as **6,907 bytes smaller** than the flag-off
build. An additive change cannot do that, and it was not a measurement artefact.
`app-shell.mjs` injects the partners client bundle and then, when Social is enabled, performs a
second `String.replace` that anchors on the *rendered text* of that bundle to insert the social
production controller before it. Changing the injection to `partnersHomeBrowserSource(options)`
without changing the anchor meant the anchor no longer matched, the replace silently did
nothing, and **the social production controller was never injected at all** whenever
`FOUNDER_OS_RELATIONSHIPS` was on. Fixed by rendering the anchor with the same arguments, with
the reason recorded at the call site.

This is why the budget is measured before and after every release rather than at the end: the
number was the only thing that noticed.

### Tests

- `scripts/test-founder-os-relationships.mjs` (new, in the `npm test` chain): 26 checks over
  the flag, the roles rule, cross-lane dedupe, ambiguity surfacing, the timeline including
  support issues, every pinned view and saved filter's advertised-vs-returned count, each new
  filter, commitments, both founder-set fields and their write path, and three separate
  rollback assertions — including one proving that turning the flag on only ADDS fields and
  never changes an existing one.
- `tests/browser/founder-os-release-3.spec.mjs` (new): the delivery plan's acceptance scenarios
  in real Chromium, plus route parity and the rollback. **7 passed** locally.
- `scripts/test-founder-os-relationships.mjs`: **29 checks passed**, and the whole `npm test`
  chain is green (exit 0) with the suite registered in it.
- **Extended differential, CI's own methodology, both sides in clean worktrees:** base
  (`dc75baa`) 30 failures, head 31. The extra was `test-vnext-performance-contract`, which the
  triage document names as the contention flake rather than one of the thirty; re-run
  standalone on the head worktree it **passes**, reporting Partners list 52,351 bytes against a
  250,000 budget and critical CSS 137,452 against 180,000. **True differential: 30 = 30, zero
  added, zero removed.**

### Recorded findings

- **Email normalization is trim-and-lowercase everywhere; plus-addressing is never collapsed.**
  `f+a@example.com` and `f+b@example.com` are two identities in every lane. This was left alone on
  purpose: `companyContactId` and `contactIdForEmail` hash the normalized address into a
  **persisted** record id, so changing normalization would re-key live records. It is a dedupe
  gap, not a bug to fix inside a UI release.
- **The mark-sent cascade touches five of the seven identity stores.** `rcapRevenueContacts`
  and `expungementLifecycleContacts` are in neither
  `COMMUNICATION_COMPOSER_READ_COLLECTIONS` nor the cascade's write list. Recording a send to
  someone known only through those two lanes will not stamp their last-contact. Out of scope
  for Release 3, which is read-side; recorded so it is not rediscovered.

---

## Release 3 — merged and deployed

**Status: MERGED as `922a555` (PR #125) at 2026-07-26T10:33:04Z. Deployed and verified.**

- All seven required checks green on the pull-request head; soak gate satisfied at **7.80h** on
  `dc75baa` before the merge.
- **Post-deploy verification: PASSED** (run `30198784913`). `POST_DEPLOY_EVIDENCE` recorded
  `expectedCommit` = `deployedCommit` = `922a555…`, `supabaseState: "connected"`, health `ok`,
  all five routes 200 and serving the shell, verified at 2026-07-26T10:44:22Z. No auto-revert.
- `GET /api/version` confirms production at `922a555c46004228178b719a744f6409085741c6`,
  `supabaseConnected: true`, `authProtected: true`, `liveGatesCount: 0`.

---

## Release 4 — the Campaigns workspace

**Status: built on branch `founder-os-release-4`. Not merged.**

### The governing constraint

Reactivation is **live in production** with waves 1 and 2 sending and waves 3 and 4 held. So
Release 4 changes the interface over the campaign and never the campaign. That is not a
guideline here, it is the architecture:

- The projection (`scripts/ui/view-models/founder-campaigns-view.mjs`) is **read-only**. It adds
  no route, calls no mutating function, and reports each control as the route that already
  implements it. A test asserts state is byte-identical after building the view twice.
- The endpoint (`GET /api/ui/campaigns`) has **no write verb**. Every other verb returns 405.
- The client runtime issues **one GET and nothing else**. A Chromium test clicks every action on
  the page with a request listener attached and asserts zero non-GET requests leave it.

### What it adds, all behind `FOUNDER_OS_CAMPAIGNS` (new, default off)

- **One lifecycle in every lane** — Plan, Review, Run, Monitor, Stop — with the same five words
  in charter order for Social, Reactivation, Partner outreach and Press.
- **The charter's translation table**, which the test suite **parses out of
  `docs/founder-os/workspaces/campaigns.md` and compares verbatim**, so the table cannot drift
  from the document that defines it. If the charter changes, the test fails and the code follows.
- **A forbidden-vocabulary guard.** The flattened surface payload must contain none of
  *heartbeat, autopilot, live mode, kill_switch, threshold_tripped, engine, cron, claim ledger,
  sendgrid, webhook*. Asserted in Node against the payload and again in Chromium against the
  rendered text. This is the mechanical form of "Roger never sees engine internals".
- **Reactivation reuses `buildCampaignCommandView` wholesale.** Every number and every blocked
  reason comes from the existing decision functions; nothing is recomputed.
- **Exceptions surface in the lane and in the view-level list Today reads**, in plain language.

### Two honesty decisions worth recording

1. **Run reports two truths, not one.** `gates.liveMode` is the position of the switch;
   `gates.sendingOn` also requires autopilot and a provider key. Reporting the switch as
   "Campaign running" while nothing could actually leave would be exactly the false completion
   the deprecation ledger's rule forbids. The surface says "Run is on, but nothing is sending"
   and gives the reason.
2. **`unavailable` and `not_built` are different states.** Collapsing them would let a real
   outage read as an unfinished feature, and vice versa.

### The Social lane exposes no publish affordance at all

`campaigns.md:53-58` forbids the new surface from inheriting the Publish Now gap. The reading
taken here is the strict one: **the lane relocates no publish route whatsoever.** It plans,
approves, and exports for manual posting, which is what the charter says the product is. Two
tests enforce it — no stage on any lane may name a publish or send route, and every mutating
route the projection names must already be served by the repository.

This also sidesteps a finding recorded below rather than depending on it being safe.

### Press: deferred, by Roger's decision

The build-or-defer checkpoint was raised once, with an estimate. **Roger chose to defer.** The
lane ships the charter's honest not-built state: every stage reports `not_built`, offers no
action, and says plainly that nothing here is real and nothing can be sent. A test asserts that
enabling `FOUNDER_OS_PRESS` does **not** fabricate a press campaign — the flag exists so the lane
has one switch, but with nothing behind it the honest state is what renders either way.

### Routes superseded

**None.** Nothing was hidden.

### Release 4 client JavaScript budget

| Build | Bytes | Headroom | Change |
|---|---|---|---|
| main (`922a555`), all flags off | 1,645,741 | 4,259 | — |
| Release 4, flag off | 1,645,741 | 4,259 | **0 — byte-identical** |
| Release 4, shell + Today + Relationships on | 1,627,800 | 22,200 | — |
| Release 4, all four flags on | 1,628,023 | 21,977 | **+223** |

Flag-off is byte-identical and flag-on costs 223 bytes, because the Campaigns surface is served
as a **lazy runtime file** rather than inline — the same mechanism Release 2 used for the action
panel. The 223 bytes are the loader's route binding, which is itself only emitted when the flag
is on. The ceiling was not touched.

### A performance improvement that came free

`GET /api/campaign/command` still takes a **full `store.readState()`**
(`preview-server.mjs:38770`), which `05_DATA_AND_INTEGRATION_CONTRACT.md` names as a legacy
full-state route to migrate "as they are wrapped". Release 4 wraps it, so the new endpoint reads
through a frozen 13-collection targeted list instead. The founder surface therefore does not
inherit the full-table hydration pattern behind the Supabase load incidents of PRs #116–#118.

### Recorded finding — the vNext publish path derives its gate from persisted state

Not a defect to fix in this release, and not the finding a subagent first reported, so it is
recorded precisely:

`publishPostNow` **does** call `livePostingEnabledForChannel` at HEAD
(`preview-server.mjs:5858`), and that route is additionally 403'd unconditionally by
`auth-endpoint-hardening.mjs`. But the **vNext** publish path
(`POST /api/ui/social/post/:id/publish`) never calls that function. It derives `facts.gate` from
`state.runtime.livePostingGates`, a **persisted** field.

I verified the safety of that path myself rather than accepting the first reading: `runtimeGates`
(`post-readiness-sources.mjs:145-156`) accepts a boolean *or* an `{enabled:boolean}` object and
yields `null` for anything else, and `eligibility` blocks on both `"off"` and `"unavailable"`
(`post-publishing-controls.mjs:441-442`). It is **shape-tolerant and fail-closed** — there is no
fail-open bug, contrary to the first report.

The residual concern is architectural, not a live hole: two publish paths establish the same fact
by different means, and only one of them calls the function the scheduled worker calls. Release 4
does not depend on either, because its Social lane has no publish affordance. Added to the
deprecation ledger so it is not rediscovered.
