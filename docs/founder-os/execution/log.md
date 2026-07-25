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
