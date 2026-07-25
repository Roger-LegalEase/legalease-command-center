# A green `npm test` says nothing about the extended, browser, or Phase 8 checks

**Why it mattered:** PR #120 was pushed with a fully green local `npm test` and came back
red on three CI jobs. The gap cost a full extra push cycle.

The three checks that local `npm test` does not cover:

1. **extended** — `npm test` runs ~106 suites. The extended job runs the other 180 via
   `scripts/run-extended-tests.mjs`, and it is a **differential** gate: it fails only on
   failures that are new versus the merge-base. To predict it, run
   `node scripts/run-extended-tests.mjs` on the branch **and** on a merge-base worktree and
   diff the two `FAIL` lists. On an unloaded machine this reproduces CI's base count
   exactly (30 = 30). On a loaded machine it does not — three suites failed locally purely
   from contention and were wrongly dismissed as noise, which hid one real failure.
2. **browser** — `npm run test:browser` boots fixture servers and exports the
   `BROWSER_TEST_*_BASE_URL` variables that several specs require. Running a spec directly
   with `npx playwright test` skips that setup, so specs like the accessibility audit fail
   with "fixture URL is required" or never run at all.
3. **Phase 8** — runs the performance, accessibility, recovery, production-verification,
   legacy-deprecation, demo and launch-gate contracts, none of which are in `npm test`.

**How to apply:** before pushing, run `npm test`, `npm run test:browser`,
`npm run test:vnext-performance`, and the base-vs-head extended diff. Treat a local
extended failure list as signal only when the machine is otherwise idle.
