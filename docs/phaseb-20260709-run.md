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

### Apply evidence (prod, 2026-07-09 ~10:52Z)

Merged as PR #41 (main 2dcc28c), auto-deploy confirmed live 10:51:41Z, commit
gate ancestor PASS, writeHealth clean. Apply run: 146 attempts inserted, 427
claims inserted, 95 attempts patched, 1 suppression patched, apply-time plan
byte-identical to the committed diff. Incident during apply: the 2 suppression
inserts were clobbered minutes later by a concurrent SendGrid webhook batch
(delayed 07-08 events retried after the deploy restart; its read-modify-write
of outreachSuppressions had read state before the inserts landed and its
snapshot reconcile-deleted them). Attempts, claims, and patches were untouched
(claims are append-only protected; the webhook write does not carry attempts).
Both suppression rows re-inserted 11:0xZ and confirmed stable; full
verify-after-write re-run: 427 attempts, 427 claims, 45 suppressions, every
planned row present and correct. LESSON for PR 2: direct-to-DB writes into
server-written non-append-only collections race the server's scoped writes;
suppression writes need the same append-only or claim-style protection.

### Step 3: the duplicate-proof gate (PASS, real prod state)

Fresh prod pull post-apply; `planReactivation` run on the exact post-unpause
state (real rows, only `status: active` simulated) at every remaining
in-window tick time today:

| Tick (UTC) | Proposals | Touch 1 to 15:00 cohort | Any step to 15:00 cohort | Any step to 12:00 cohort | Claim collisions | Suppressed leakage |
|---|---|---|---|---|---|---|
| 12:00 | 150 | 0 | 0 | 0 | 0 | 0 |
| 16:00 | 150 | 0 | 0 | 0 | 0 | 0 |
| 20:00 | 150 | 0 | 0 | 0 | 0 | 0 |

The 138 previously unledgered recipients (and the rest of both cohorts) are
double-blocked: attempt row (planner) plus claim row (send path). Every
proposal is a fresh (contact, step) that must claim-before-send through the
deployed PR 1 path; the engine fails closed without the claim ledger.
Thresholds on the reconciled ledger: hard_bounce 20/426 = 4.69% < 6%, not
tripped (spam 0, unsub 0). GATE PASSES. Proceeding to go-live per the order.

### Step 4: go-live (executed 2026-07-09T11:08:59Z, authorized by Roger's order)

Scoped PATCH of the reactivationCampaign singleton only: `status: active`,
`pausedReason` cleared, audit fields `unpaused_at`/`unpaused_by`/`unpause_note`
recorded on the singleton, plus a companyEvents audit record
(`ev-phaseb-golive-20260709`). Thresholds, caps, window, waves, and every
other setting untouched; the 6% hard_bounce threshold stays exactly as Roger
set it. liveMode was already enabled (owner action 2026-07-08T09:58Z), so the
pause clear was the go-live trigger as planned. Verified through the owner
status endpoint: active, not tripped (4.69%), armed true, sendClaims total
427, outside window at 11:09Z (07:09 ET). First live tick: 12:00Z (08:00 ET).

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

## Activation run (Roger's order, 2026-07-09 ~11:30Z onward)

Order: everything connected and operational; authorized flips are scoped and
listed; B1 reactivation settings, gates, threshold, and window are untouched
by this run.

Architectural fact governing the whole run: PROSPECT_LIVE_DISCOVERY, every
ENABLE_LIVE_*_POSTING gate, and OUTREACH_LIVE_SEND are read from process.env
ONLY. They are Render dashboard environment variables; no API or state write
can flip them, and this environment has no Render credential. The autopilot
toggles ARE state-backed and were executed where authorized. So "flip" splits
into: my part (autopilot, verification, readiness, audits) done now, and
Roger's part (env vars in Render) listed explicitly below.

### B5 prospect discovery

- Autopilot for `prospect-discovery` enabled 11:37:15Z via
  /api/heartbeat/autopilot (owner token), companyEvents audit
  `ev-b5-autopilot-on-20260709`. Prod status confirms `autopilotEnabled: true`,
  `liveDiscoveryWired: true`, `liveDiscoveryFlag: false` (env still off).
- Validation run (local, flag on, real loaders): 200 candidates fetched and
  staged from IRS BMF in 1.8s; all 200 `review_state: pending_review`
  (56 legal_aid, 144 nonprofit); zero candidates carry an email (structurally
  unsendable); zero auto-approved or promoted. Nothing auto-promotes: only
  POST /api/prospects/approve writes approval, human-only.
- ROGER ACTION: set `PROSPECT_LIVE_DISCOVERY=true` in the Render dashboard for
  legalease-command-center-prod. With autopilot already on, discovery runs at
  the next daily tick after the env change, no further action needed.

### Social posting

- Prod truth via /api/channels: every platform (LinkedIn, X, Facebook,
  Instagram, Threads) is `setup_required` with NO client credentials in the
  prod environment (LinkedIn missing LINKEDIN_CLIENT_ID/SECRET/REDIRECT_URI;
  X missing X_CLIENT_ID/SECRET/REDIRECT_URI; Meta missing
  META_CLIENT_ID/SECRET/REDIRECT_URI), no stored OAuth tokens, all posting
  gates off.
- Consequence: OAuth verification is impossible on every platform (there is
  no credential to verify), so ZERO posting gates were flipped and the test
  post cannot be queued against a connected channel. App-approval status is
  NOT determinable from the codebase or config: no app ids exist anywhere in
  the repo or prod env. No status is being fabricated.
- Adapter dry-run proof: test-linkedin-oauth-safety, test-linkedin-oauth-
  callback, test-meta-connector, and test-scheduled-publishing all pass.
  Three ORPHANED suites (test-linkedin-readiness, test-linkedin-approval-queue,
  test-social-posting-safety) fail identically in a clean worktree and are not
  wired into npm test or check: stale assertions against older UI copy, noted
  as tech debt, not activation-relevant.
- No-autonomous-posting assertion (verified in code, not assumed): the only
  posting-adjacent engine is `publishing-run`, whose act() publishes ONLY
  posts a human already moved to approved or scheduled through the Review
  Desk (preview-server.mjs:1716 blocks everything else), blocks
  complianceRisk high, and still requires the per-channel env live gate plus
  a connected account at publish time. B6 (autonomous social autopilot) does
  not exist in HEARTBEAT_ENGINE_IDS. There is no path from content generation
  to a network post without a human approval in between.
- ROGER ACTIONS (per platform, in the developer portals, then Render env):
  LinkedIn: developer app + "Share on LinkedIn" / w_member_social product
  access, then LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET,
  LINKEDIN_REDIRECT_URI. Meta: developer app + pages_manage_posts (and
  instagram_content_publish for IG) through App Review, then META_CLIENT_ID,
  META_CLIENT_SECRET, META_REDIRECT_URI. X: developer project/app with OAuth2
  PKCE, then X_CLIENT_ID, X_CLIENT_SECRET, X_REDIRECT_URI. After env vars
  land: connect accounts via Settings connector tiles (OAuth flow), and only
  then flip ENABLE_LIVE_<PLATFORM>_POSTING=true per platform. The queued test
  post through the Review Desk happens as soon as the first platform verifies.

### B2 outreach readiness

- STOP CONDITION CONFIRMED, reported before any activation: the outreach send
  path has NO claim-before-send. actOutreach (outreach-os.mjs:621-700) sends
  from approved queue items with zero claim ledger, records attempts only in
  memory for the tick's closing write, and on transport error re-marks the
  queue item `approved` "for retry", which is a silent re-enqueue on timeout:
  a timed-out send that actually reached SendGrid re-sends next tick. This is
  the July 8 defect shape on a colder audience. Fix in flight as a code PR
  (outreachSendClaims mirroring PR 1) with full verifier ceremony; B2 does
  not activate before that PR is deployed, in addition to the DNS gate.
- Sequences and CAN-SPAM: all 8 classifications route fail-closed into 4
  code-defined sequences (verified-reporting, clinic-extension,
  government-accountability, employer-pathway); do-not-enroll and unmapped
  classifications cannot be queued or sent. Rendered touch 1 for every
  classification: compliance PASS, Dover DE postal present, unsubscribe text
  present, List-Unsubscribe header present.
- UPL review per standing rule: sequences A/B/C are operational copy
  (workflow, intake, reporting for the org's own legal work), no hold needed.
  SEQUENCE D (employer-pathway, classification second_chance_employer) IS
  UPL-ADJACENT and flagged for Lawrence's sign-off: all five touches promise
  record-clearing outcomes to non-legal recipients ("clearing the record
  itself, which can open up roles, licensing, and advancement", "a safe,
  guided record-clearing path", "help people clear the records that block
  advancement"). Touches 1, 2, 3, 5 are the substantive flags; touch 4
  references the pathway mildly. Nothing from second_chance_employer should
  be approved in the queue until sign-off.
- Target list state: outreachContacts 0, outreachOrganizations 0,
  outreachAttempts 0, approved outreach queue items 0 (the 13 approvalQueue
  rows are posts and reports, not outreach). B2 activation will produce
  zero-send ticks until B5 approvals promote orgs and contacts with emails
  are added. Suppression checks verified present at both plan time and send
  time (isSuppressed at outreach-os.mjs:640 and in planOutreach).
- Caps and window verified in code: capCheck enforces the ET window first
  (outreach-os.mjs:485), then per-day, per-domain, per-classification caps
  from DEFAULT_OUTREACH_CAPS merged with outreachConfig.caps; applied at plan
  (line 591) and re-checked at send (line 661).
- Dry-run tick on real prod state (simulated in-window 12:00 ET): 0 proposals,
  0 act results, 0 attempts, nothing sent (no transport injected).
- From-address isolation: outreachConfig.fromEmail currently defaults to
  roger@legalease.com, the SAME domain as B1 (reputation 97). Plan: SendGrid
  domain authentication on the dedicated subdomain outreach.legalease.com,
  then set outreachConfig.fromEmail to the subdomain via
  POST /api/outreach/config at activation time (changing it before domain
  auth would fail DMARC).
- DNS records: BLOCKED on SendGrid API access. The authenticated-domain CNAME
  values are account-specific (SendGrid generates them); SENDGRID_API_KEY
  exists only in the prod Render env, not in this Codespace, and no server
  endpoint proxies the SendGrid config API. Roger has two options, either
  unblocks the records: (a) add SENDGRID_API_KEY to .env.local here and I
  drive domain authentication via the SendGrid API end to end, outputting the
  exact records; or (b) SendGrid dashboard: Settings -> Sender Authentication
  -> Authenticate Your Domain -> domain outreach.legalease.com -> copy the
  three CNAME records into DNS. After records resolve, I verify via API (a)
  or Roger confirms validation in the dashboard (b), then gates flip.

### B1 first live tick (12:00Z): claims held the line through a mid-tick crash

Timeline reconstructed from prod (this session): lease claimed by cron
12:00:06.641Z; 111 claims minted 12:00:16.728Z to 12:00:58.446Z (one per send,
inserted BEFORE each SendGrid call); claims stopped at 111 of a 150 budget;
the web service crashed around 12:01 (one status probe returned an HTML error
page; the service answered normally minutes later); NO heartbeatRuns record
for 12:00Z exists and the lease was never released, so the tick died mid-run
and its closing write never happened. writeHealth after restart: clean
(successful write 12:09:29Z, zero failures), so the crash was process death,
not Supabase.

What the claims system did: every one of the 111 (contact, step) pairs holds
a durable claim row, so the 13:00Z tick will SKIP all 111 (already_claimed)
and continue with fresh contacts. Yesterday this exact crash produced the
duplicate-send incident; today it produces zero duplicate risk.

Evidence sends really went out: SendGrid webhook events with 12:0xZ
timestamps arrived (5 delivered, 3 clicks, 1 open at check time and rising).

Cost (the known PR 2 gap, now demonstrated in production): the claimed-to-sent
transitions and the 111 attempt rows were in memory only and are lost. Those
claims will surface as `unconfirmed` in the status view after the 15-minute
grace. Follow-ups: (a) per-send durable transitions (PR 2, next), (b) a small
claims-plus-webhook reconciliation to restore the 111 attempt rows (same
ceremony as PR 3), (c) crash cause needs Render logs (no access here): Roger
should pull web service logs for 12:00:30Z to 12:02Z. Rate impact:
denominator-conservative (missing attempts UNDERSTATE sent count, so the
computed bounce rate is higher than true; safe direction).

## Activation run continuation (fresh session, 2026-07-09 ~18:30Z onward)

Per protocol every carried-over claim was re-audited against a tool result from
this session before further action:

- Prod `/api/version`: `commit 2dcc28c` (main tip), production, supabase
  connected (18:20Z). The claims branch `a344216` is pushed but NOT in main.
- B5 `/api/prospects/status`: `autopilotEnabled: true`,
  `liveDiscoveryWired: true`, `liveDiscoveryFlag: false`. The morning flip
  holds; the env var remains Roger's Render action. Nothing re-flipped.
- Social `/api/channels`: all five platforms still `setup_required`, zero
  client credentials, zero stored tokens, every posting gate off. OAuth
  verification remains impossible; no gate flipped, no test post queueable.
- Outreach `/api/outreach/status`: autopilot false, liveSendFlag false,
  `sendgridKeyPresent: true` (prod holds the key), postal + from set, caps
  25/2/10 window 8-17 ET weekdays, queued 0 approved 0 sent 0, suppressions
  88, unsubscribes 37, bounces 28. Zero targets, so activation stays inert
  until B5 approvals promote orgs.
- `.env.local` unchanged since Jun 26: still no SENDGRID_API_KEY locally.

Two precision corrections to the morning session's social section, from a
full code re-read this session:

1. "B6 does not exist in HEARTBEAT_ENGINE_IDS" was imprecise. A
   `publishing-run` engine DOES exist in the registry; what it can do is
   publish ONLY posts a human already moved to approved or scheduled through
   the Review Desk, and only with the per-channel env live gate on and a
   connected account at publish time (triple-gated, autopilot default OFF).
   What was never built is autonomous authoring or approval. The assertion
   that no path posts without a human approval in between stands.
2. `POST /api/posts/:id/publish-now` (human-triggered, admin-gated) calls
   publishReadiness with `requireLiveGate: false`, so this ONE manual
   endpoint bypasses the ENABLE_LIVE_* env gate. It still requires an
   approved or scheduled post, a finalized image, and a connected account
   with a decryptable token, so it is inert today (no accounts exist). Noted
   as a hardening item, not an activation blocker.

Also noted for later hardening (not blocking, reported): outreach
suppression's isExistingRelationship covers partners and pilots but does NOT
cross-check reactivationContacts, so a B1 consumer address that somehow
entered the B2B target list would not be suppressed by that rule alone; and
SendGrid webhook events never confirm outreach claims to `sent` (same
reconciliation gap B1 has, PR 2 scope).

### DNS unblock: server-side domain-auth driver (code change, this session)

The morning session declared the DNS records blocked because the CNAME
values are account-specific and SENDGRID_API_KEY exists only in prod. This
session closed that gap in the authorized direction: the server itself now
drives SendGrid domain authentication, so the key never leaves prod and
Roger's manual surface stays exactly one action (paste records at the DNS
provider).

New module `scripts/sendgrid-domain-auth.mjs` + endpoint
`POST /api/outreach/domain-auth` (admin-gated by the existing
/api/outreach/ POST rule):

- Actions: `status` (read-only), `create` (idempotent: returns the existing
  record if one exists; otherwise creates the authenticated domain with
  `automatic_security: true, default: false` so B1's default sending domain
  can never be displaced), `validate` (per-record DNS verdicts, repeatable).
- Default domain `outreach.legalease.com` (the dedicated cold-send
  subdomain); domain input validated as a bare hostname before any network
  contact.
- Scoped to the v3/whitelabel/domains API only: cannot send mail, is not a
  general SendGrid proxy, never returns or logs the key. Missing key fails
  closed before network.
- create and passing validate emit a companyEvents audit record (scoped
  write, alerts-gate pattern).
- Tests: `scripts/test-sendgrid-domain-auth.mjs` (8 checks: pre-network
  input rejection, fail-closed on missing key, exact isolation payload,
  idempotent create, read-only status, validate targeting and
  refusal-before-create, key-never-leaks including provider error paths,
  sparse-payload mapping). Wired into npm test and npm run check.

Activation sequence once merged and deployed (auto-deploy): call
`{"action":"create"}` against prod, surface the three CNAME records to
Roger, he installs them and replies done; then `{"action":"validate"}` until
`valid: true`; then POST /api/outreach/config sets fromEmail to the
authenticated subdomain identity, and only then do the send gates flip
(OUTREACH_LIVE_SEND is Roger's Render env action; outreach-sequencer
autopilot is the API flip with its companyEvents audit).

### B2 outreach claim-before-send (code change, PR pending verifier)

Mirrors PR #40 exactly for the cold-outreach path: new append-only
`outreachSendClaims` collection (registered in coreStateCollections,
OUTREACH_COLLECTIONS, appendOnlyCollections); deterministic claim id
`outreach-claim-<campaign>-<contact>-step-<n>`; atomic claim before any live
send; existing claim in any state skips AND rejects the duplicate queue item
so it stops replaying; no claim path or claim-write failure fails closed;
transport failure marks the claim failed and REJECTS the queue item,
replacing the old leave-approved silent retry (a timed-out send that actually
delivered can never re-send); in-tick person dedupe; dry-run burns zero
claims; claims summary added to /api/outreach/status. Tests:
scripts/test-outreach-claims.mjs (8 checks) wired into npm test and check.
