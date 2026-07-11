# Cleanup / follow-up list

Running list of deferred work. Add items here instead of leaving them implicit.

## Open

- **`.env.local` leaks into spawned test servers** (queued 2026-07-11). Tests that spawn
  `preview-server.mjs` (e.g. `test-social-posting-safety`, `test-linkedin-approval-queue`)
  fail in a developer worktree because the spawned server reads `.env.local` from the repo
  root: the real `COMMAND_CENTER_OWNER_TOKEN` / auth config overrides the test's fixture
  env, so requests the test expects to succeed come back 401. The full chain only passes
  in a clean worktree (the current CI-gate workaround). Proposed fix: an explicit
  `SKIP_ENV_LOCAL_FILE=1` (or a `COMMAND_CENTER_ENV_FILE` override) honored by the env
  loader in `preview-server.mjs` and set by every test that spawns the server, so test
  envs are hermetic regardless of what a developer keeps in `.env.local`. Beyond test
  noise, the same mechanism hands production secrets to any spawned child that did not
  ask for them, which is why this does not get to stay background noise.

_No open UI / layout follow-ups._

<!-- Resolved: Proof surface converted to the shared `command-*` layout in 60d29f1. -->
<!-- The remaining Proof data pass (people-helped / packets-created wiring) is tracked under A2 in command-center-master-plan.md. -->
