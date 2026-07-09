# Phase B run doc: send idempotency, per-send durability, ledger reconciliation

Run started 2026-07-09 ~02:53 UTC. Fixing the two defects established in
`docs/incident-20260708-duplicate-sends.md`: (1) non-idempotent send path,
(2) ledger recorded only in the tick's closing write. Campaign stays PAUSED
throughout; no gate flips, no sends (mock transport only), no unpause.

## Step 0: post-deploy baseline verification of 23658ca (PASS)

Prod host: `legalease-command-center-prod.onrender.com`. All probes read-only
(GET, or POSTs designed to be rejected before any state access). Times UTC.

| Check | Result | Evidence (this session, 2026-07-09) |
|---|---|---|
| `/api/version` | PASS | `commit: 23658ca00e873d0a1ff41a099085440b57b63063`, `environment: production`, `storageBackend: supabase`, `supabaseConnected: true`, `liveGatesCount: 0`, HTTP 200 (02:53Z) |
| writeHealth | PASS | `/api/health/supabase` (owner token): `backend: supabase`, `lastWriteOkAt: 2026-07-09T03:00:25.565Z`, `lastWriteErrorAt: ""`, `lastWriteError: ""`, `failedWriteCount: 0` |
| PR #34 scoped unsubscribe, first time live: rejects bad token | PASS | GET `/api/outreach/unsubscribe?token=bogus-step0-check` returns HTTP 400 with the invalid-or-expired page; POST with no token returns HTTP 400. Handler returns before any state read or write (`preview-server.mjs:35419-35426` at 23658ca), so no state change. Note: the endpoint rejects invalid tokens with 400 by design; the 401 fail-closed behavior belongs to the SendGrid webhook, verified next. |
| SendGrid webhook fails closed | PASS | Unsigned POST to `/api/outreach/webhooks/sendgrid` returns HTTP 401; POST with bogus signature and timestamp headers returns HTTP 401 |
| Heartbeat health | PASS | `/api/heartbeat/status`: 50 of 50 `recentRuns` have `status: success`, zero non-success entries; latest run 2026-07-09T03:00:07.470Z (alerts engine, `acted: false`) |
| Pause state intact | PASS | `/api/reactivation/status`: `campaignStatus: paused`, `pausedReason: "hard_bounce 7.12% >= 6.00%"`, `liveSendFlag: false`, `thresholdTripped: true`. Observed but NOT touched: `autopilotEnabled: true` for the reactivation-sequencer engine; the pause is the active guard, exactly as the incident report left it. |

Baseline is clean. Proceeding to PR 1.

### Step 0 re-verification (fresh session, 2026-07-09 ~09:30 UTC)

Per protocol every progress claim is audited against a tool result from the
current session, so all Step 0 probes were re-run:

| Check | Result | Evidence (2026-07-09 ~09:30Z) |
|---|---|---|
| `/api/version` | PASS | `commit: 23658ca00e873d0a1ff41a099085440b57b63063`, `environment: production`, `supabaseConnected: true`, `liveGatesCount: 0` |
| writeHealth | PASS | `/api/health/supabase`: `lastWriteOkAt: 2026-07-09T09:29:12.129Z`, `lastWriteErrorAt: ""`, `failedWriteCount: 0` |
| Unsubscribe rejects invalid | PASS | GET with bogus token 400, POST with no token 400 (reject-before-state-access by design) |
| SendGrid webhook fails closed | PASS | Unsigned POST 401; bogus signature + timestamp headers 401 |
| Heartbeat health | PASS | 50 of 50 `recentRuns` success; newest run 2026-07-09T09:00:04.982Z (alerts, `acted: false`) |
| Pause state intact | PASS | `campaignStatus: paused`, `pausedReason: "hard_bounce 7.12% >= 6.00%"`, `liveSendFlag: false`, `thresholdTripped: true` |

## PR 1: atomic claim-before-send (in progress)

### What it changes

New append-only collection `reactivationSendClaims`, registered in
`coreStateCollections` with a membership test, excluded from the snapshot
reconcile-delete pass so a stale in-memory snapshot can never erase a claim
another invocation inserted (the 2026-07-08 clobber shape).

New store primitive `claimCollectionItems(collection, items)`:

- Supabase flavor: one conditional INSERT with `on_conflict=collection,item_id`
  and `Prefer: resolution=ignore-duplicates,return=representation`. The database
  unique key is the atomicity test across processes and restarts; the response
  contains only the rows this caller won. Errors are recorded in writeHealth and
  rethrown (fail closed).
- JSON flavor: read-check-append-write serialized on the store write queue
  (local/dev single-process).

Engine changes in `actReactivation`:

- Deterministic claim id `react-claim-<campaign>-<contact>-step-<n>`, one per
  (campaign, contact, step) for the lifetime of the campaign.
- Before any live send: an existing claim in ANY state (claimed, sent, failed)
  skips the send with a logged skip. Otherwise the claim is durably inserted
  first; losing the insert to a concurrent invocation skips with
  `already_claimed_concurrent`.
- A live-send-capable invocation without a claim path fails closed
  (`no_claim_path`); a claim-write failure blocks the send
  (`claim_write_failed`). The ledger is the permission to send.
- Transport failure or executor decline marks the claim `failed` with the
  reason and keeps it forever; a timeout never silently re-enqueues. Stale
  `claimed` rows past a 15-minute grace surface as `unconfirmed` in
  `buildReactivationLiveStatus().sendClaims` for operator decision.
- In-tick person-level dedupe (contact_id plus normalized email) under the
  planner dedupe: duplicate contact rows yield one send.
- Dry-run and gate-closed paths burn zero claims; posture unchanged.
- One clock per tick: the pre-claim decision and the executor re-check see the
  same `now`, so a window boundary crossed mid-tick cannot let the executor go
  live on a step the pre-decision declined to claim.

Server injects `claimReactivationSends: store.claimCollectionItems(...)` into
the heartbeat registry; the engine fails closed without it.

Tests: `scripts/test-reactivation-claims.mjs` (11 checks) covering concurrent
double invocation (one send per contact-step), claim kept on failure and never
auto-retried, duplicate-rows-one-send, fail-closed paths, dry-run burns no
claims, Supabase conditional-insert wire shape plus outage fail-closed,
reconcile-delete exclusion, JsonStore contract. Wired into `npm test` and
`npm run check`.

### Gates (all from this session)

- Targeted suites at eb181ea: claims 11/11, reactivation-os 13, live-mode 10,
  dedupe 6, copy 26, scoped-write-hardening 19, registration-backlog 5,
  heartbeat 10. All pass.
- Clean-worktree CI gate: fresh `git worktree` at eb181ea (no `.env.local`),
  full `npm run check` then `npm test`, `EXIT:0`, 86 suite-pass lines, chain is
  `&&`-sequenced so no pipe-masked failure is possible.

### Verifier findings and resolutions (fresh-context subagent, verdict MERGE-SAFE)

1. MAJOR: `reactivation-fire-touch1-wave1.mjs` remains an unclaimed live-send
   path (attempts-ledger idempotency only, closing-write-after-send, no pause
   check, no row dedupe). Pre-existing, manual, double-gated. Resolution:
   this is PR 2's bypass-interlock scope; PR 2 will interlock it against the
   enabled scheduler, route it through the claim primitive or disable it, and
   write a companyEvents audit record per invocation. Not a reason to hold
   PR 1; nothing invokes it while paused.
2. MAJOR (operational): claims protect only post-deploy sends; the 146
   unreconciled 15:00 recipients would be claimed-then-resent on unpause.
   Resolution: known and by design of the phase plan; the pause is the guard
   and PR 3 closes it. No unpause under any circumstances this run.
3. MINOR: the tick's closing write still upserts the whole claims collection,
   so a stale snapshot from a second instance could regress a claim's status
   payload (never delete it; skip logic is existence-based, so no resend), and
   at full campaign scale that is a prod-hostile full-collection write.
   Resolution: PR 2 makes per-send scoped writes the system of record and
   drops the claims collection from the closing snapshot.
4. MINOR: `appendOnlyCollections` cannot protect the JSON backend (whole-file
   rewrite). Dev-only; prod is Supabase. Accepted with rationale.
5. MINOR: failed claims are re-proposed by the planner every tick and consume
   per-tick budget slots as skips; a full-batch transport outage could stall
   the campaign at zero sends (safe direction). Resolution: unconfirmed and
   failed claims surface in the status view now; PR 2 adds the alerting that
   makes a degraded tick loud. Operator resolution stays manual by design.
6. MINOR: a contact row with empty `contact_id` would share one claim id and
   block other keyless contacts (fail-closed, never duplicates); both import
   paths derive `contact_id` from the normalized email, so unreachable in
   practice. Accepted with rationale.
7. NOTE: no chunking in the claim primitive (engine claims one row per call
   today). Accepted; revisit if a batch caller ever appears.
8. NOTE: claim timestamps use wall clock while decisions use the hoisted
   `ctx.now`; cosmetic skew only. Accepted.

Verifier per-category conclusions: heartbeat send path has no unclaimed live
route; the only delete path in the codebase (reconcile pass) now excludes
claims; the PostgREST conditional-insert semantics and the (collection,
item_id) unique key are real; claim ids are stable against the 2026-07-08
shred shape (identical contact_ids, row-key instability); tests drive real
code against a semantics-faithful stub; no gate, pause, threshold, or wave
semantics change anywhere in the diff.

## Priority change 2026-07-09 (Roger's direct order)

The campaign goes live this run. New sequence: reconcile the ledger, prove zero
duplicate risk via the plan-only gate, then clear the pause. Roger explicitly
authorized the unpause and live-send activation in the ordering prompt, subject
only to the duplicate-proof gate. PR 2 is parked and resumes after go-live.
Step 1 outcome: no PR 2 work-in-progress existed anywhere (clean tree, no
branch), so there was nothing to commit or park.

## PR 1 post-deploy verification (c187127, auto-deploy)

Auto-deploy is on: prod served c187127 without a manual promote. Verified this
session (~10:30Z):

| Check | Result | Evidence |
|---|---|---|
| `/api/version` | PASS | `commit: c187127b...`, production, supabase connected |
| Commit gate | PASS | `prod-commit-gate.mjs --required c187127`: ancestor rule PASS |
| writeHealth | PASS | `lastWriteOkAt: 2026-07-09T10:09:03.787Z`, zero failed writes |
| Heartbeat | PASS | 0 non-success recent runs; latest 10:00:06Z |
| Pause intact | PASS | paused, `hard_bounce 7.12% >= 6.00%`, liveSendFlag false |
| Claims surface | PASS | `/api/reactivation/status` now exposes `sendClaims` (all zeros, correct: no live sends since deploy) |

Also observed for Step 4 planning: `liveMode.enabled` has been true since
2026-07-08T09:58Z and sequencer autopilot is on, so CLEARING THE PAUSE IS THE
GO-LIVE TRIGGER. Nothing gets cleared until the gate passes.

## PR 3: ledger reconciliation from the final SendGrid export

Script: `scripts/reconcile-20260708-sendgrid-ledger.mjs` (plan/apply, apply
needs `--yes-write-prod`). Pure data reconciliation: conditional inserts plus
per-row scoped PATCHes, zero deletes possible, campaign singleton and contact
rows untouched, idempotent re-run. Settled incident facts are hardcoded abort
guards; any mismatch stops before a single write. Full row-level diff (every
row inserted or annotated, byte-identical to what apply writes):
`docs/phaseb-20260709-reconciliation-diff.json`.

Computed from prod plus the export this session, all guards passing:

- 146 attempt inserts for the lost 15:00Z batch: real recv/full message ids,
  real processed timestamps, touch identity computed per contact (117 step 1,
  29 step 2, matching the incident report), ids `react-attempt-recon2-<contact>`,
  `source: sendgrid-reconciliation`.
- 95 patches on the synthetic 12:00Z rows: real message ids added (they had
  none); the 33 duplicate-affected recipients annotated
  `duplicate_copies_processed`/`duplicate_copies_delivered` with a one-counted-
  touch note; the one divergence found is dcalmesejr@gmai.com, which the export
  shows as a 12:00:26Z SendGrid drop (never processed), corrected from `sent`
  to `dropped` (address already suppressed, so no resend exposure). Step
  numbers in the synthetic rows validated correct against June touches (21
  June-touched 12:00 recipients all already step 2).
- 427 claim backfills into reactivationSendClaims using the exact live-path
  `reactivationClaimId` format: 426 `sent` (186 June, 94 12:00, 146 15:00),
  1 `failed` (the drop). The PR 1 safety ledger now also blocks every
  historical (contact, step) at the claim level, independent of the attempts
  ledger.
- 2 mandatory suppression inserts found missing: topcarrier16@icloud.com
  (hard-bounced/blocked 07-08, no suppression row existed) and
  ybrewer@holmescc.edu (unsubscribed 15:02:28Z per the unsubscribe ledger, no
  suppression row existed; legal requirement). All other bounced addresses,
  lanceaskinssr@icloud.comm, and dcalmesejr@gmai.com verified already
  suppressed. No other list changes.
- 1 suppression annotation: jaime.berrios@introba.com gets the recovered
  first-unsubscribe evidence (clicks 12:00:56Z to 12:01:08Z from both duplicate
  copies; ledger row lost with the closing write; honored via 16:10Z re-clicks).

Tests: `scripts/test-reconcile-20260708.mjs` (6 checks: touch identity,
duplicate annotation, drop correction, claim id format and uniqueness,
suppression minimality, idempotent apply with zero deletes and campaign/contact
untouchability). Wired into `npm test` and `npm run check`.

### Pre-merge gate simulation (local, this session)

Post-reconciliation state simulated locally (prod rows plus the computed diff,
campaign status simulated active), `planReactivation` at 2026-07-09T16:00Z:

- proposals: 150 (budget), due: 733
- proposals hitting the 15:00 cohort: 0
- proposals hitting the 12:00 cohort: 0
- proposals colliding with an existing claim: 0
- proposals to suppressed emails: 0
- step mix: 119 step 1 (fresh contacts), 31 step 2 (June-only contacts, last
  touched 2026-06-29, correct cadence)

Expected post-reconciliation hard_bounce rate: 20/426 = 4.69%, below the 6%
threshold, so the monitor will not re-trip on unpause. The real gate runs
against prod after merge, deploy, and apply.

### Verifier verdict (fresh-context subagent, independent recomputation)

DIFF-MATCHES-EXPORT, zero discrepancies in all seven categories, script safe
to apply. The verifier wrote its own CSV parser and verifier, recomputed every
class from the raw export plus the prod snapshots, confirmed the committed
diff is byte-identical to the branch copy (sha256 vs `git show HEAD:`), and
confirmed: 146 inserts bijective with the 15:00Z processed events with
recomputed steps 117/29 matching per row; 95 patches with first-copy message
ids verified per row against sorted timestamps and exactly 33 duplicate
annotations matching recomputed processed/delivered counts; 427 claims
one-to-one with the post-reconciliation ledger in the exact live-path id
format; exactly 2 mandatory suppression inserts and no other list changes;
the jaime annotation's cited clicks real (14 click events 12:00:56Z to
12:01:08Z from both duplicate copies); all 146 previously unledgered
recipients double-blocked (attempt row plus claim row) after apply; the
script incapable of deletes, campaign writes, contact writes, or sends. One
LOW observation: after a successful apply, a full CLI re-run aborts at the
settled-fact guards (fail-closed) rather than passing as a clean no-op; the
write layer itself is idempotent and tested. Clean-worktree gate at f301671:
EXIT:0, 87 suites.
