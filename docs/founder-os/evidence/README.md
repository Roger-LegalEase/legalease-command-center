# Evidence — Founder OS consolidation package

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

## Collection

- **Collection commit:** `a3793c3156bc2c866dbd1f65e0ec420ae2352554` — origin/main tip,
  `fix(storage): stop Founder Mode from hydrating the full Supabase state (#111)`,
  committed 2026-07-22 19:14:44 -0400.
- **Collection date:** 2026-07-23.
- All evidence in this directory was regenerated at that commit; nothing is carried
  forward from the earlier inspection unverified.

## What changed since e620bde

The prior inspection bundle was collected at `e620bde` (tip of the
`hotfix/founder-targeted-reads` branch). Since then, PR #111 squash-merged that branch
into main as `a3793c3`. The two commits have **byte-identical trees**
(`git rev-parse e620bde^{tree} a3793c3^{tree}` → `b401a9e` for both), so:

- No file content changed between the historical inspection and current HEAD; only the
  commit graph differs (three hotfix commits squashed into one merge commit).
- The route inventory is unchanged (75 canonical routes, 53 aliases, 6 primary nav items
  — see `route-inventory.md`).
- The e620bde bundle remains an accurate description of current code content, and every
  claim in this package was still re-verified directly against `a3793c3`.

The commits folded in by #109–#111 relative to earlier July baselines: Founder Mode MVP
(#109), auth sessions and rate limits moved off Supabase to Upstash (#110), and targeted
Supabase collection reads for Founder Mode routes replacing full-state hydration (#111).

## Contents

| File | What it proves |
|---|---|
| `current-head.txt` | Collection sha and date |
| `repo-tree.txt` | Tracked file tree at HEAD (via `git ls-tree`; node_modules/.git/dist/build absent by tracking) |
| `loose-ends.md` | TODO/FIXME/HACK grep, orphan-test check, stub and no-op inventory with file:line |
| `route-inventory.md` | 75 canonical routes + 53 aliases from the live registry, vs the historical count |
| `safety-gates.md` | Re-verification that the three enforcement points exist as blocking code |
| `publish-now-gate-review.md` | The manual Publish Now live-gate gap — **still open** at HEAD |
| `parallel-implementations.md` | social-clean/ accounting (untracked stale clone) and other parallel copies |
| `inspection-bundle-e620bde/` | The historical inspection baseline, included verbatim as collected at e620bde |

## Post-#113 delta — 2026-07-23

Focused refresh after the audit-fixes work (PR #113, branch `audit-fixes-01` @
`0beb01e`; **still OPEN/unmerged at refresh time**, with production running `a3793c3`).
Original findings above and in each file are preserved; dated status updates are
appended, never rewritten.

- **Publish Now per-channel live gate: CLOSED** by #113 — enforcing check inside
  `publishPostNow` + `scripts/test-publish-now-live-gate.mjs`; see the dated update in
  `publish-now-gate-review.md` (including the unconditional hardening-403 correction).
- **sharp: resolved at 0.35.3** (the CVE-fixing version); render QA suites pass with no
  API changes.
- **Node: pinned 24.x** in package.json `engines` and via `NODE_VERSION` on both Render
  services (production observed on 24.14.1).
- **PII: contained** in gitignored `data/private/` with a pre-commit gate reusing the
  security-scan tooling (`npm run hooks:install` per clone); CI enforcement proposed in
  `../08_DELIVERY_PLAN.md`.
- **New production observation:** `/api/version` on 2026-07-23 reported
  `liveGatesCount: 5` (all live-posting flags enabled in prod env — contradicts
  render.yaml and the dormant assumption) and `supabaseConnected: false`. Recorded in
  `safety-gates.md`; owner decisions, unchanged by #113.

## Privacy

No env values, contact data, or suppression data appear anywhere in this directory. The
historical bundle contains env-var **names** only (`03-env-var-names.txt`) and a redacted
log sample. The frozen code snapshots inside `inspection-bundle-e620bde/04-schema/` are
dated evidence exhibits, not implementations (see `parallel-implementations.md`).
