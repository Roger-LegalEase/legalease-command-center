# Incident report: duplicate reactivation sends, 2026-07-08

> **Epilogue, 2026-07-13 — the bypass script is dead.** `scripts/reactivation-fire-touch1-wave1.mjs`
> is deleted. It was the operator escape hatch written on the morning of this incident, and it kept
> the incident's exact shape long after the incident was closed: up to 150 live consumer emails sent
> in a loop, recorded only in memory, persisted in a single `writeCollections` **after** the last
> send, with no entry in the `reactivationSendClaims` ledger. Die mid-loop — crash, OOM, deploy,
> dropped socket — and every email already sent leaves no durable trace, so the next run re-sends the
> whole batch to real people. Both the Phase-B run doc and the "Proposed fix" section below recommended
> retiring it; it survived because it was double-gated and nothing invoked it. That is not a safety
> property, it is luck with a countdown. Its stated reason to exist ("the heartbeat reactivation engine
> cannot currently send a live reactivation email") is obsolete: the heartbeat now injects
> `runReactivationSend` and claims every send before it leaves the building. A regression test in
> `test-scoped-write-hardening.mjs` now asserts the file stays gone, and — more usefully — that **no**
> `reactivation-*.mjs` script may call the SendGrid API without claiming first. The lesson this file
> paid for: a send path whose durability depends on surviving the loop is not idempotent, it is a bet.

Phase A read-only diagnosis. All prod interaction was GET probes with the owner token plus direct read-only Supabase REST selects. No state was written, no gates touched, no sends made. All times UTC. SendGrid ground truth comes from the activity export in `docs/ebd3dae7-5a52-4be4-a6fa-5a842780637a.csv` (742 events; complete for 2026-07-08, partial for June).

## Executive summary

Two distinct defects fired today, and they are not the one the leading hypothesis predicted.

1. **The 12:00 duplicates came from one invocation, not a race.** The hourly heartbeat tick (the only scheduler; single Render cron per `render.yaml:32-39`) ran the sequencer over a contact list that was still shredded into duplicate rows (the storage defect diagnosed in PR #33). The planner on the code then deployed had no per-person dedupe, so each duplicate row of a due contact became one more SendGrid call inside a single sequential send loop. 149 processed sends to 94 people, 33 people got 2 to 4 copies, star@flipthescriptrecovery.com got 8 copies, matching that contact's 8 duplicate rows. The two-enqueue-sources hypothesis is killed by evidence below.

2. **The send ledger lost both batches because the tick records attempts only in one closing write, after all sends.** The closing full-state writes of the ticks at 12:00, 15:00, 16:00 and 17:00 never persisted (evidence below). The 149 raw attempt records from 12:00 and all 146 from 15:00 were therefore never durably recorded. A reconciliation session this afternoon rebuilt the 12:00 batch as 95 synthetic ledger rows, but the 15:00 batch has zero ledger coverage.

Two urgent consequences:

- **The campaign must stay paused until the ledger is reconciled.** 138 recipients of the 15:00 batch would receive a duplicate send if the campaign is unpaused, because the planner believes they were never touched today. The only thing currently preventing that is the auto-pause, which itself fired on corrupted data (below).
- **The current pause is an artifact.** The threshold monitor computed hard_bounce 20/281 = 7.12% >= 6.00% at the 20:00 tick. The true denominator including the lost 146 attempts is at least 427, giving 4.68%, under the threshold. The pause is wrong-for-the-right-reasons: keep it, but know the rate it quotes is not real.

## Timeline (UTC, 2026-07-08, all items verified this session unless labeled)

| Time | Event | Evidence |
|---|---|---|
| 09:58:11 | Owner armed reactivation live mode | `reactivationCampaign.liveMode.history` |
| 12:00:06 est. | Hourly tick fires (neighbor ticks stamp :00:06 to :00:09); sequencer plans over shredded contacts (3,838 rows, 537 distinct emails per PR #33 diagnosis), budget cap 150 | run-record stamps; PR #33 commit 8405546 |
| 12:00:20 to 12:00:34 | 149 sends processed by SendGrid, 94 unique recipients, sequential over ~15s | CSV |
| ~12:00:35 | Tick's closing full-state write FAILS TO PERSIST: no heartbeatRuns entries for this hour exist for any engine, no raw attempt rows exist, and webhook rows ingested 12:00:30 to 12:01:04 survive with original timestamps (a landed closing write would have reconcile-deleted them, since its snapshot predates them) | state + Supabase row stamps |
| 12:00:57 to 12:01:08 | jaime.berrios@introba.com clicks unsubscribe from both duplicate copies (CSV); NO unsubscribe ledger row from this window survives | CSV + `outreachUnsubscribes` |
| 13:00, 14:00 | Ticks run and persist (entries exist, `acted: true`), zero sends. Inferred: threshold auto-pause on the then-configured 2% hard_bounce threshold (bounces from the 12:00 batch were ingesting; minSampleSize 100 was exceeded). UNVERIFIED (the pause stamp was later overwritten), but it is the only reading consistent with acted-with-no-sends and with the 14:42 unpause that follows | run records; CSV bounce timeline; `evaluateThresholds` logic |
| 14:21:28 | Contact list rebuilt: all 3,824 current contact rows carry this `created_at`. Restores one row per person (wave split 300/700/1198/1626, planned was 300/700/1200/1627) | contact rows |
| 14:30:53 | Bounce backfill: batch of suppression rows stamped this second | `outreachSuppressions` |
| 14:42:55 | Campaign singleton updated: hard_bounce threshold raised 0.02 to 0.06 with owner note "to complete wave 2 (unverified list); revisit after wave 2"; campaign left active | `reactivationCampaign.updated_at`, `threshold_note` |
| ~14:4x | 95 synthetic attempt rows written for the 12:00 batch, ids `react-attempt-recon-20260708-...`, uniformly stamped 12:00:08.242, one per unique recipient (94 processed + 1 SendGrid drop, dcalmesejr@gmai.com). No server-side trail: ran as a local CLI against Supabase | attempt ids and stamps |
| 15:00:34 to 15:00:35 | 146 sends processed, 146 unique, zero duplicates, zero overlap with 12:00 (the recon ledger excluded the morning's recipients from the plan) | CSV |
| 15:00 to 17:00 | Closing writes of the 15:00, 16:00, 17:00 ticks never persist: no run entries for any engine those hours, no attempt rows for the 146. Failure cause UNVERIFIED (see open questions) | state + Supabase row stamps |
| 15:02 to 16:17 | Unsubscribes recorded normally: ybrewer 15:02:28, rolds 16:02:10, jaime.berrios 16:10 to 16:17 (4 rows, re-clicks from both copies) | `outreachUnsubscribes` |
| 18:00 onward | Ticks persist again. 18:00/19:00/20:00 `acted: true`, zero sends: threshold now trips at 20/281 = 7.12% >= 6% because the denominator is missing the 146. Each trip re-stamps the pause; last stamp `paused_at` 20:00:28.710 | run records; `pausedReason`; `actReactivation` lines 666-670 re-stamp unconditionally before the already-paused check |
| 20:46:07 | Last webhook ingest rewrites contact rows (routine scoped write, not an incident event) | Supabase row stamps |

Prod commit at time of this report: `e51297d` (verified via `/api/version`), which includes PR #29 (live mode), PR #30 (first scoped-write fixes) and PR #33 (stable contact keys + planner dedupe). It does NOT include PR #34 (scoped unsubscribe), #36, #37, #38 (tier sweeps). At 12:00 prod necessarily ran an older commit: #30 merged 13:15 and #33's fix commit is timestamped 14:01, so neither existed at 12:00. Exact promote time of e51297d is unknown to this session (Render `deployedAt` reports "unknown"): between 14:01 and the 15:00 tick if the clean batch used the new planner, but note the 14:21 contact rebuild alone explains the clean batch even on old code, so the promote can only be bounded to 14:01 to 18:00. UNVERIFIED: ask Roger / Render dashboard.

## Hypothesis verdicts

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Bypass script + scheduler racing | **KILLED** | Both batches align exactly with :00 tick times (first processed 12:00:20, 15:00:34). Single 15s sequential send window at 12:00, incompatible with two concurrent loops interleaving to produce 8 copies 2 to 12 seconds apart of a single subject. No CLI trail today in agentRuns, companyEvents, or the audit log. Duplicate multiplicities (max 8) exactly match the documented contact-row duplication (up to 8 rows per person). Surviving run-record pattern shows one runId per hour, 6 engine entries each. |
| Doubled scheduler tick | **KILLED** | One Render cron (render.yaml). Every surviving hour has exactly one runId with one entry per engine. A doubled tick would also have produced uniform 2x duplication, not the observed 2x to 8x distribution matching row counts. |
| Retry-on-timeout re-enqueue | **KILLED** | No retry logic exists on the send path (`actReactivation`: one `runReactivationSend` call per proposal, errors are recorded and skipped, `reactivation-os.mjs:712-720`). Duplicates carry distinct subjects timing consistent with one loop. |
| Duplicate contact rows x no planner dedupe (single invocation) | **CONFIRMED** | PR #33 (commit 8405546, merged as e51297d) diagnosed and fixed exactly this: index-keyed Supabase rows shredded `reactivationContacts` to 3,838 rows / 537 emails, and `planReactivation` had no per-person dedupe. The 12:00 batch ran before that fix existed. The planner's per-tick budget (150) matches the batch size (149 processed + 1 drop). |
| PR #38 changed ordering/locking on this path | **KILLED** | PR #38 (9c4002c) is not an ancestor of e51297d; prod has never run it. Verified via `git merge-base --is-ancestor`. |

## Where the idempotency gap is (file/line, current main)

1. **Record-after-send, persist-at-end.** `scripts/reactivation-os.mjs` `actReactivation` (line 658): for each proposal it calls the injected sender (line 714, the real SendGrid call), then appends the attempt to in-memory state (line 736). Nothing is persisted per send. The attempts reach storage only in the heartbeat tick's single closing write (`scripts/heartbeat.mjs`, after all engines run). If that write fails or the process dies, every send of the tick is unrecorded, which is exactly what happened twice today. There is no claim, no unique key, no per-send durability.

2. **Dedupe is by ledger lookup at plan time, not an atomic claim.** `planReactivation` line 616 calls `touchesSentFor(state, contact.contact_id)` against the in-memory attempts list. Within one tick this is computed once per contact before any send; across ticks it only works if the previous tick's attempts persisted. There is no (contact, campaign, touch) uniqueness anywhere in storage.

3. **The tick-level serialization (PR #30) does not help across processes or failures.** `serializeStateMutation` is an in-process promise queue. It cannot make the closing write durable, and it cannot dedupe against sends whose records were lost.

The PR #33 planner dedupe (line 599-610) closes the duplicate-rows vector specifically, and is on prod now. It does not close the lost-ledger vector, which is what turns any future write failure into duplicate sends on the next tick.

## Blast radius (authoritative, ledger vs SendGrid)

- **12:00 batch:** 149 processed sends, 94 unique recipients, 33 recipients with duplicates, 55 excess sends, worst case 8 copies (star@flipthescriptrecovery.com, all delivered). Ledger now holds 95 reconciled single-touch rows (94 recipients + 1 drop), so all 94 are correctly excluded from future planning: **zero resend exposure from this batch**, and cadence proceeds as if one touch, which is the correct forward-looking accounting. The 55 excess deliveries are recorded nowhere internally; SendGrid is the only record.
- **15:00 batch:** 146 sends, 146 unique recipients, **zero ledger coverage**. Wave mix per current contacts: 93 wave-2, 53 wave-1. 117 recipients have no attempt row at all; 29 wave-1 recipients have only their 2026-06-29 touch. After subtracting recipients since suppressed or flag-paused by webhook events, **138 recipients would be re-sent the same touch on unpause** (110 with no attempts + 28 touch-repeats). This is the concrete resend risk the reconciliation must close before anyone unpauses.
- **Cadence honesty:** for the 33 duplicated recipients the ledger undercounts what they experienced (1 recorded touch vs 2 to 8 received). Recommended handling is a ledger annotation, not touch-count inflation, since inflating would skip them ahead in the sequence; see reconciliation plan. star@ (8 copies) merits a manual hold/apology decision by Roger.
- **Counters and caps:** `todaysReactivationTally`, day caps, and all campaign rates currently run on a ledger missing 146 of today's 240 real recipients. Every derived number (7.12% included) is wrong until reconciled.
- **Bounce day-rate check:** CSV shows 10 unique hard-bounced recipients of 240 unique = 4.17%, matching the incident brief.

## Suppression verification (read-only)

- jaime.berrios@introba.com is present in `outreachSuppressions` (reason unsubscribed, source one_click, 2026-07-08T16:10:19.475Z) and 4 times in `outreachUnsubscribes` (16:10:19, 16:12:33, 16:17:17, 16:17:50), consistent with clicks from two distinct signed tokens (both duplicate emails; both were delivered per CSV). The planner excludes this contact via `isSuppressed` -> `inSuppressionLedger` (`scripts/outreach-os.mjs:129,178`), verified against the live ledger rows. **Suppressed: yes.**
- Caveat 1: the earliest unsubscribe clicks (12:00:57 to 12:01:08 per CSV) left no ledger row. The recorded rows are from re-clicks at 16:10 onward. The 12:01 unsubscribe intent was lost with the same write-loss window as the tick, and honored only because the recipient clicked again.
- Caveat 2: the prompt asked to confirm PR #34's scoped unsubscribe path recorded this. **It did not: PR #34 (2ebf765) is not deployed** (not an ancestor of e51297d). These rows were written by the pre-#34 handler. #34's behavior under real traffic is still unverified in prod.
- Caveat 3: the contact record itself still shows `unsubscribed: false` (the 14:21 rebuild reset flags and the pre-#34 handler's flag write did not stick). Protection currently rests on the suppression ledger alone, which `isSuppressed` does consult. All 11 hard-bounced emails today are likewise covered (10 flagged `bounced: true` by post-rebuild webhook ingests, 1 covered by ledger row only).

## Threshold evaluation record

- Threshold in effect: hard_bounce 0.06, stored in the `reactivationCampaign` singleton (`thresholds.hard_bounce`), set 2026-07-08T14:42:55Z by owner decision per the stored `threshold_note`. The code default is 0.02 (`scripts/reactivation-os.mjs:211`); the singleton overrides it. Not changed by this investigation.
- Recorded evaluation: `pausedReason` = "hard_bounce 7.12% >= 6.00%", `paused_at` 2026-07-08T20:00:28.710Z. Arithmetic: 20 bounce-class events (16 bounce + 2 dropped + 2 blocked, all-time) / 281 sent attempts = 7.117% (`campaignRates`, `reactivation-os.mjs:379-397`).
- Assessment: numerator is real; denominator is corrupted low by the 146 lost attempts. Corrected floor: 20/427 = 4.68%, below 6%. The monitor did its job on the data it had; the data was wrong. Do not unpause on the strength of the corrected number alone: the resend exposure above must be fixed first.
- Note: `actReactivation` re-stamps `pausedReason`/`paused_at` on every tick while tripped (lines 666-670 run before the already-paused early return), so `paused_at` records the latest evaluation, not the first trip. The first trip today was likely the 13:00 tick against the old 2% threshold (inferred, see timeline).

## Open questions for Roger

1. What ran at 14:21 to 14:43 (contact rebuild, bounce backfill, attempt reconciliation, threshold bump)? It left no server-side trail, so it was a local CLI session against Supabase. I need its exact write pattern to be sure it did not contribute to the 15:00 to 17:00 write losses.
2. When exactly was e51297d promoted on Render? The dashboard deploy log will pin whether the 15:00 to 17:00 ticks ran on old or new code, and whether a deploy restart killed a tick mid-run.
3. Render service logs for 12:00:30 to 12:01:30 and 15:00 to 18:00 would confirm the closing-write failure mode (Supabase error vs process death). The in-memory `writeHealth` telemetry was lost to restarts and nothing persisted it.
4. star@flipthescriptrecovery.com received 8 copies and all were delivered: manual hold plus apology, or leave in cadence?

## Proposed fix (Phase B, PR-shaped, pending approval)

**PR 1: atomic send claims (the idempotency boundary).**
Claim BEFORE send: a `reactivationSendClaims` row keyed `(campaign_id, contact_id, step_number)` written and verified via a conditional insert on the Supabase table (unique key on collection+item_id makes the insert itself the atomic test), before `runReactivationSend` is called. Second concurrent or later invocation finds the claim and skips. Send outcome then updates the claim (sent / failed / released); a failed send releases the claim explicitly, and a timeout leaves the claim held with a stamped expiry so the next tick neither resends silently nor re-enqueues; expired-unconfirmed claims surface in the status view for operator decision, not auto-retry. Attempts remain the reporting ledger; claims become the safety ledger. Registered in `coreStateCollections` with stable per-item ids. Regression tests: concurrent double-invocation of `actReactivation` yields one send per (contact, touch); failure path releases; timeout path holds and never re-enqueues.

**PR 2: per-send durability plus mutual exclusion.**
The sequencer persists attempts and claims incrementally (scoped `writeCollections` per batch of N sends or per send), not solely in the tick's closing write, so a failed closing write can no longer erase evidence that sends happened. The bypass script (`reactivation-fire-touch1-wave1.mjs`) gets a hard interlock: it refuses to run unless campaign status is paused AND autopilot for the sequencer is off (its original wave-1 job is done; retirement is my recommendation, interlock at minimum). Regression tests: simulated closing-write failure leaves per-send records durable; bypass script exits nonzero when the scheduler is live.

**PR 3: ledger reconciliation (prod data change, exact diff in the PR before deploy).**
From the SendGrid export (ground truth): (a) insert 146 attempt rows for the 15:00 batch, one per recipient, correct wave/step from current contacts, `sent_date` 2026-07-08, ids `react-attempt-recon2-...`; (b) annotate the 33 duplicated 12:00 recipients' existing recon rows with `duplicate_copies_delivered: N` (no touch-count inflation); (c) recompute rates: expected hard_bounce 20/427 = 4.68%; (d) leave the campaign PAUSED; unpausing stays Roger's manual call after reviewing the post-reconciliation numbers. Verification: re-run the blast-radius queries from this report and show 0 resendable-on-unpause recipients for both batches. No sends, no gate changes.

Sizing: PR 1 and PR 2 are each a focused day-scale change with tests; PR 3 is a small script plus its verification evidence. Same merge protocol as the hardening run: verifier subagent review, sequential merge, clean-worktree gate, Render promote, post-deploy verification. Also worth folding in (small, same class): persist `writeHealth` snapshots so a failed closing write is visible after restarts, and dedupe `outreachSuppressions` appends (taraunr@hmail.com has 6 rows).

## Evidence appendix (session probes, all read-only)

- `/api/version`, `/api/health`, `/api/reactivation/status`, `/api/heartbeat/status`, `/api/state` (owner token, GET only)
- Supabase REST selects of `leos_core_records` row stamps for reactivationAttempts (281 rows, all last-written 20:00), heartbeatRuns (297 rows, 20:00), reactivationContacts (first/last 20:46:07)
- `docs/ebd3dae7-5a52-4be4-a6fa-5a842780637a.csv` (SendGrid export)
- Code at prod commit: `git show e51297d:scripts/preview-server.mjs` (webhook route 35296-35337, unsubscribe path pre-#34); `scripts/reactivation-os.mjs` current main lines cited inline; PR ancestry via `git merge-base --is-ancestor`
- Claims labeled UNVERIFIED above: the 13:00/14:00 auto-pause inference, the exact promote time of e51297d, and the mechanical cause of the four lost closing writes (12:00 loss is confirmed as never-persisted by the surviving-row analysis; whether Supabase write failure or process death did it needs Render logs)
