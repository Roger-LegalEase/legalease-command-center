# Parallel implementations — evidence at current HEAD

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

- **Collected at:** `a3793c3156bc2c866dbd1f65e0ec420ae2352554`, 2026-07-23.
- **Question:** what does `social-clean/` actually contain, does anything use it, and do other parallel copies of engines, storage, or UI exist?

## Finding 1 (discrepancy resolved): social-clean/ is an untracked, gitignored stale clone

The assignment described `social-clean/` as a parallel copy inside the repo. At current
HEAD it is **not tracked in git at all**:

- `git ls-tree -r HEAD --name-only -- social-clean` returns nothing.
- `.gitignore:59` contains `social-clean/`.
- The directory holds its own nested `.git` — it is a **full separate clone of the entire
  repository** (root config, `lib/`, `scripts/`, `docs/`, `assets/`, `supabase/`,
  `templates/`), not just social code.
- Its nested HEAD is `2dcc28c`, dated **2026-07-09** ("Merge pull request #41 …
  ledger-reconciliation") — roughly two weeks behind main's `a3793c3` (2026-07-22).

Consequence: "removing social-clean/" is a working-tree cleanup (delete the directory,
optionally drop the `.gitignore:59` entry), not a code-deletion commit against tracked
files. It is still recorded as a separate future PR/cleanup task in
`../07_MIGRATION_AND_DEPRECATION_LEDGER.md` and as a Release 1 precondition in
`../08_DELIVERY_PLAN.md`, because the danger it poses (editing the wrong copy, stale
safety code masquerading as current) is real regardless of tracking status.

## File-by-file accounting (304 files compared, excluding social-clean/.git)

| Classification | Count | Notes |
|---|---|---|
| IDENTICAL to main-tree counterpart | 161 | Untouched between 2026-07-09 and HEAD (e.g. `lib/safe-fetch.mjs`, `lib/storage/postgres.mjs`, `scripts/priority-engine.mjs`, most of `scripts/test-*.mjs`, course docs) |
| DIFFERS from counterpart | 138 | In every spot-check the main tree is newer/larger |
| EXISTS ONLY in social-clean/ | 5 | Files main has since removed/renamed |

Counterpart mapping is a trivial 1:1: `social-clean/<path>` ⇄ `<path>` at repo root.

**Files that exist only in social-clean/:**

| social-clean path | Why absent in main |
|---|---|
| `social-clean/scripts/lee-engine.mjs` | Replaced by `scripts/lee-assistant.mjs` in the Le-E rebuild |
| `social-clean/scripts/test-lee-engine.mjs` | Test for the removed lee-engine |
| `social-clean/scripts/test-lee-rewrite-button.mjs` | Removed in the Le-E rebuild |
| `social-clean/scripts/test-lee-visible-actions.mjs` | Removed in the Le-E rebuild |
| `social-clean/docs/phaseb-20260709-reconciliation-diff.json` | One-off dated artifact never carried into main |

**Representative staleness of the 138 differing files** (main lines vs social-clean lines):
`scripts/preview-server.mjs` 41,899 vs 38,842 · `scripts/storage.mjs` 1,538 vs 790 ·
`package.json` 188 vs 72 · `render.yaml` 88 vs 46 · `scripts/heartbeat-engines.mjs` 179
vs 165. The stale copies predate the scoped-write hardening completion, the Founder Mode
targeted-read fixes (PRs #109–#111), the Le-E rebuild, and the send-claim machinery in
`publishPostNow` — and the stale `publishPostNow` lacks `acquireSocialPublishClaim`
entirely (see `publish-now-gate-review.md`). The full differing-file list spans root
config, storage/engine/server code (`scripts/storage.mjs`, `scripts/outreach-os.mjs`,
`scripts/reactivation-os.mjs`, `scripts/sendgrid-webhook.mjs`, `scripts/heartbeat.mjs`,
`scripts/preview-server.mjs`, `lib/storage/index.mjs`, …) and ~75 test files.

## Finding 2: nothing references social-clean/

`grep -rn "social-clean"` across the repo (excluding `node_modules`, `.git`, and
`social-clean/` itself) finds only:

- `.gitignore:59` — the ignore rule itself
- `docs/founder-os/evidence/inspection-bundle-e620bde/01-repo-tree.txt` — a plain-text
  directory listing inside the historical evidence bundle

Zero imports, requires, script references, `package.json` entries, `render.yaml`
references, or test-runner references. **social-clean/ is entirely unreferenced dead
weight.**

## Finding 3: other parallel copies on disk (all untracked)

| Location | Tracked? | Nature | Executable code copies? |
|---|---|---|---|
| `social-clean/` | No (gitignored) | Full stale repo clone with nested `.git` | Yes — everything |
| `inspection-bundle/` (repo root) | No (untracked) | e620bde inspection artifact | Yes — `04-schema/code/{storage.mjs, company-memory.mjs, validate-migrations.mjs, check-supabase-schema.mjs}`, `04-schema/lib-storage/`, config copies |
| `docs/founder-os/evidence/inspection-bundle-e620bde/` | Added by this PR | Historical baseline copy of the same bundle | Same frozen snapshots as above — retained deliberately as **evidence**, clearly dated, never imported |
| `quarantine/` | No (gitignored) | Cutover logs only | No |

No `*-old` / `*-v2` / `*-backup` directories exist. The live tree has exactly one storage
engine (`scripts/storage.mjs` + `lib/storage/`), one server (`scripts/preview-server.mjs`),
and one copy of each campaign engine.

The frozen code snapshots inside the historical inspection bundle are evidence exhibits,
not implementations: they are unreferenced, unmodified, and labeled with their collection
commit. They are the one sanctioned exception to the prohibition below, exactly because
they exist to prove what the code looked like at e620bde.

## Prohibition (restated by the reuse ledger)

No parallel implementation of tasks, CRM records, campaign engines, activity timelines,
or storage may be created. The consolidation reuses the single live implementation of
each; any duplicate found on disk is scheduled for removal, never for divergent editing.

---

## Refresh 2026-07-25 — `social-clean/` is still present, still unreferenced

Re-checked at HEAD `fdbc3341e50500a643dec35a89844a7fe9dd62ac`. Everything above stands.

- **Still on disk, still untracked, still gitignored.** `git ls-tree -r HEAD
  --name-only -- social-clean` returns nothing; `.gitignore:59` still contains
  `social-clean/`; `git status --porcelain` does not list it.
- **Still stale at the same commit.** Its nested HEAD is `2dcc28c`, 2026-07-09
  ("Merge pull request #41 … ledger-reconciliation") — now **16 days** behind main, and
  behind the entire perf/hardening arc (#116, #117, #118) as well as everything it was
  already missing. 305 files outside its `.git` (was 304).
- **Still referenced by nothing executable.** Repo-wide grep (excluding
  `node_modules`, `.git`, and `social-clean/` itself) finds only `.gitignore:59`, the
  historical bundle's plain-text tree, and the three Founder OS documents that schedule
  its removal (`07_MIGRATION_AND_DEPRECATION_LEDGER.md:56`, `:75`;
  `08_DELIVERY_PLAN.md:49–55`; `01_CURRENT_STATE_REUSE_LEDGER.md` prohibition section).
  Zero imports, script entries, `render.yaml` references, or test-runner references.
- **Staleness now includes safety-relevant storage code.** Its `scripts/storage.mjs`
  predates the read/write circuit split, the request gates, and the core-mutation
  executor entirely. Editing that copy by accident would reintroduce the exact class of
  outage #116–#118 fixed. The **Remove** status in the migration ledger is reaffirmed,
  still as a separate future PR, still not this documentation PR.

### Other parallel copies — unchanged

| Location | Tracked? | Status at fdbc334 |
|---|---|---|
| `social-clean/` | No (gitignored) | Present, stale at `2dcc28c`, unreferenced |
| `inspection-bundle/` (repo root) | No (untracked) | Still present |
| `docs/founder-os/evidence/inspection-bundle-e620bde/` | Yes (tracked since #112) | Unchanged evidence exhibit |
| `quarantine/` | No (gitignored) | Cutover logs only |

**No new parallel copies were created by #115–#118.** The live tree still has exactly
one storage engine (`scripts/storage.mjs` + `lib/storage/`), one server
(`scripts/preview-server.mjs`), and one copy of each campaign engine. The new modules
added by the perf arc (`scripts/supabase-backoff.mjs`,
`scripts/boot-state-read-collections.mjs`, `scripts/request-context.mjs`) are
single-implementation extractions used by that one storage engine, not duplicates of it.
`scripts/test-support/fake-supabase-server.mjs` is a test double, referenced only from
tests.
