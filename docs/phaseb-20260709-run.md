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

## PR 2: per-send durable writes, write-failure alerting, bypass interlock (not started)

## PR 3: ledger reconciliation (not started)
