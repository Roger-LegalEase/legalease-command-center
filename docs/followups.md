# Cleanup / follow-up list

Running list of deferred work. Add items here instead of leaving them implicit.

## Open

- **`.env.local` leaks into spawned test servers** (queued 2026-07-11). Any test that
  spawns `preview-server.mjs` with `cwd` at the repo root gets a server that loads the
  developer's real `.env.local`: the real `COMMAND_CENTER_OWNER_TOKEN`/auth config
  overrides the test's fixture env, so fixture-token requests come back 401 (reproduced
  live 2026-07-11 while end-to-end testing the guidelines gate; also the root cause
  recorded for the historic npm-test 401s - the full chain passes in a clean worktree,
  the current CI-gate workaround). Proposed fix: an explicit `SKIP_ENV_LOCAL_FILE=1`
  (or a `COMMAND_CENTER_ENV_FILE` override) honored by the env loader in
  `preview-server.mjs` and set by every test that spawns the server, so test envs are
  hermetic regardless of what a developer keeps in `.env.local`. Beyond test noise, the
  mechanism hands real secrets to any spawned child that did not ask for them, which is
  why this does not get to stay background noise.
  - Correction for the record (2026-07-11): the two visibly failing tests in this
    worktree, `test-social-posting-safety` and `test-linkedin-approval-queue`, are NOT
    this leak - they are stale source-scan assertions (they never spawn a server, and
    they fail in a clean worktree too). `test-linkedin-approval-queue` was already
    quarantined in `run-extended-tests.mjs` on 2026-07-03; `test-social-posting-safety`
    asserts the old hardcoded "Live social posting is off" copy that the display-truth
    work replaced with live safety-posture labels, and is now quarantined with the same
    convention (fix the assertion, then delete the entry).
- **Extended (non-gate) test suite has drifted further since the 2026-07-03 quarantine
  pass** (queued 2026-07-11). Six more extended tests fail at origin/main in a clean
  worktree - `test-activation-center`, `test-app-status-recovery`,
  `test-external-action-outbox`, `test-more-workspace` - all pre-existing, none
  env-dependent (clean worktree has no `.env.local`). (`test-email-draft-safety` and
  `test-email-readiness` were in this list and were FIXED 2026-07-12 during inbox I3:
  stale display-truth assertions updated to the derived posture chain; both green.) The npm-test CI gate is unaffected and green. Needs the same
  fix-the-assertion-or-quarantine pass as the 2026-07-03 batch.

_No open UI / layout follow-ups._

<!-- Resolved: Proof surface converted to the shared `command-*` layout in 60d29f1. -->
<!-- The remaining Proof data pass (people-helped / packets-created wiring) is tracked under A2 in command-center-master-plan.md. -->
