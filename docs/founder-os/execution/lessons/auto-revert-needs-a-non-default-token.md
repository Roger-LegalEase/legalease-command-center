# A pull request opened with GITHUB_TOKEN never runs its own checks

**Why it mattered:** the auto-revert half of the release pipeline is supposed to open a
revert pull request and merge it as soon as its checks pass. With the default token that
can never happen, so a rollback would sit open forever while the run believed it had
shipped.

GitHub does not start workflow runs for events raised by the default `GITHUB_TOKEN`. Main
is protected by seven required checks, so a revert pull request opened with that token has
zero checks, `gh pr merge --auto` never fires, and the rollback never ships.

**How it is handled in `.github/workflows/post-deploy-verification.yml`:** the checkout,
`gh pr create`, and `gh pr merge --auto` steps all use
`secrets.FOUNDER_OS_AUTOMATION_TOKEN` when it exists and fall back to `github.token` when
it does not. Without the secret the revert pull request is still created and labelled
`auto-revert`, and the job then fails loudly so the rollback is one click for Roger instead
of a hunt. Either way the run stops.

**How to apply:** provisioning that secret is an environment change, which this run may not
make. If Roger wants the rollback to ship without him, he creates a fine-grained personal
access token with `contents: write` and `pull requests: write` on this repository and saves
it as the repository secret `FOUNDER_OS_AUTOMATION_TOKEN`. Nothing else changes.
