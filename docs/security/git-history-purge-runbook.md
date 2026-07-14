# Git history purge runbook

No history rewrite was performed in this hardening branch.

Affected path manifest (paths only):

- `docs/ebd3dae7-5a52-4be4-a6fa-5a842780637a.csv`
- `docs/phaseb-20260709-reconciliation-diff.json`
- `docs/incident-20260708-duplicate-sends.md`
- `docs/phaseb-20260709-run.md`
- `data/exports/campaign-kits/**` (historical)
- `data/exports/reports/investor-update-*` (historical)

Before work, appoint an incident owner, notify every collaborator, freeze pushes/merges/releases, disable automation, and create an encrypted offline mirror plus a separately verified bundle backup. Record branch/tag hashes without copying file contents. Rotate or revoke exposed credentials in provider consoles before considering the incident closed.

In an isolated clone, install and verify `git-filter-repo`, review `git filter-repo --analyze`, then prepare a path manifest file containing the entries above. The reviewed command shape is `git filter-repo --invert-paths --paths-from-file <reviewed-manifest>`. Do not run it from this branch or against the shared checkout. Review removed-object reports and run the repository scanner in history mode; output must contain paths, categories, counts, and fingerprints only.

After two-person review, announce the exact freeze window, push rewritten branches/tags with the minimum coordinated force operation, invalidate caches and stored artifacts, and require every collaborator and deployment checkout to delete its old clone and re-clone. Do not merge old branches after the rewrite.

Verify with `node scripts/security-scan.mjs --history`, object reachability checks, fresh-clone CI, and provider credential inventories. Rotate/revoke Supabase keys, SendGrid keys/webhook configuration, OAuth client secrets/tokens, session/OAuth/asset signing secrets, cron/product-event secrets, and any other exposed credential. Confirm old credentials fail using provider-safe read-only checks.

If the rewrite is incorrect, keep the repository frozen, restore the encrypted mirror to a new restricted remote, compare hashes/manifests, and repeat the reviewed procedure. Never force-push the mirror over the shared repository without incident-owner and security-reviewer approval.
