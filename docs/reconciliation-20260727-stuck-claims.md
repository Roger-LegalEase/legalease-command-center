# Stuck reactivation send-claims — evidence and reconciliation plan (2026-07-27)

266 reactivation send claims sit at status `claimed`: written before a send, never confirmed
after it. A claim in any state permanently blocks that (contact, step), by design, so a lost
outcome never auto-retries. The result was a campaign that reported itself healthy while
sending almost nothing for thirteen days.

This document records the evidence the reconciliation rests on. It was gathered read-only.

## The population

| Claim day | Stuck | Recorded sent that day | Total claims that day |
|---|---|---|---|
| 2026-07-09 | 153 | 131 | 284 |
| 2026-07-13 | 109 | 11 | 120 |
| 2026-07-27 | 4 | 0 | 4 |
| **Total** | **266** | | |

## What SendGrid can and cannot tell us

**Email Activity API (`GET /v3/messages`) — per-message, but retention does not reach.**
The key is authorised (`access_settings.activity.read`) and the endpoint answers 200. Probed
day by day, it returns records for **2026-07-27 only**. Every earlier day returns zero,
including days we know carried hundreds of sends (07-08, 07-09, 07-13, 07-14). So per-message
activity lookup can reconcile the 4 claims from today and **cannot reach the other 262**. This
is stated plainly rather than assumed: it was measured.

**Stats API (`GET /v3/stats`) — aggregate, and retention does reach.** It returns per-day
totals for the whole period, and this is what settles the 262.

| Date | SendGrid requests | SendGrid delivered | Reactivation claims created | Delta |
|---|---|---|---|---|
| 2026-06-29 | 309 | 291 | 186 | +123 |
| 2026-07-08 | 600 | 572 | 241 | +359 |
| **2026-07-09** | **283** | 271 | **284** | **−1** |
| **2026-07-13** | **120** | 119 | **120** | **0** |
| 2026-07-14 | 9 | 9 | 9 | 0 |
| **2026-07-27** | **4** | 4 | **4** | **0** |

On the three days our stuck claims come from, SendGrid accepted **one request per claim**.

The two large positive deltas are explained and do not weaken this: 2026-06-29 predates the
claim ledger entirely, and 2026-07-08 is the duplicate-send incident, where one claim produced
several copies. Both are consistent with the ledger being incomplete *then*, not with extra
traffic *now*.

**Attribution.** These stats are account-wide, so the reasoning depends on no other sender
being active. `outreachAttempts` and `outreachSendClaims` are both **0** — the B2 outreach
engine has never sent. Press has never sent. On 07-09, 07-13 and 07-27 the reactivation engine
was the only live sender in this system.

## What this means, and why it inverts the obvious assumption

A claim stuck at `claimed` looks like a send that never happened. **It is the opposite.** The
emails went out; the write that would have recorded them timed out. Every one of these people
has already received the email their claim covers.

Releasing them as "not sent" would re-email 266 people who already received it — the same
class of harm as the 2026-07-08 duplicate-send incident.

## Why local webhook events cannot classify these on their own

We hold 1,165 SendGrid webhook events. They carry no message id, so a stuck claim can only be
matched to an event by recipient and time proximity, and the answer moves with the window:

| Matching window after claim | Claims "confirmed" |
|---|---|
| 15 minutes | 44 |
| 30 minutes | 64 |
| 2 hours | 85 |
| 12 hours | 91 |

A number that depends that strongly on an arbitrary parameter is not evidence. Worse, absence
of an event is not absence of a send: 2026-06-29 carried 186 real sends and produced **0**
stored events, because the webhook was not yet armed. Local events are used only as
corroboration, never as the sole basis for a classification.

## Dry-run result (2026-07-27, run against production data and live SendGrid, wrote nothing)

| Class | Count | Resolution | Evidence |
|---|---|---|---|
| `confirmed_per_message` | **4** | confirm | SendGrid Email Activity, message id and delivered status per recipient |
| `confirmed_daily_totals` | **109** | confirm | 2026-07-13: SendGrid accepted 120, exactly 120 claims created |
| `no_record` | **0** | release | — |
| `undetermined` | **153** | leave blocked | 2026-07-09: SendGrid accepted 283 but 284 claims were created |

**Nothing would be released.** No claim anywhere in the population lacks a SendGrid record.

**The 153 from 07-09 are held back by a single message.** The rule only resolves a day when
SendGrid's accepted count and the claims created that day agree exactly, and 283 ≠ 284. One
claim out of 284 did not become a send and we cannot tell which, so the rule declines the whole
day rather than guess. That is deliberately strict, and it is the owner's call whether to
accept it:

- **Leave all 153 blocked** (what the plan does today): nobody is emailed twice, and 153 people
  miss one touch to protect against one uncertain case.
- **Confirm all 153 on the day-level evidence**: at most one person misses one touch, and 152
  correctly never hear from us again about that step. Nobody is emailed twice either way,
  because confirming never sends.

Confirming is the safe direction in both options. The difference is only how many people are
correctly recorded as already-contacted versus left in a permanent block.

## Reconciliation plan

Three classes, each with its evidence recorded on the claim:

1. **`confirmed_delivered`** — SendGrid's per-message activity record exists. Applies to the
   4 claims from 2026-07-27. Evidence: message id and status from `GET /v3/messages`.
2. **`confirmed_by_daily_reconciliation`** — per-message activity is outside retention, but
   SendGrid's own accepted-request count for that day matches the claims created that day 1:1.
   Applies to the 262 from 07-09 and 07-13. Evidence: the daily totals above.
3. **`no_record`** — SendGrid shows no send. Released so the contact becomes eligible again.

On this evidence class 3 is expected to be empty, and the recommendation is to **confirm all
266 rather than release any**. The trade-off is stated so the owner decides knowingly:

- Confirming a claim that really did send: correct — that person is never re-emailed.
- Confirming a claim that did *not* send: that person misses **one** touch of a five-touch
  sequence. Given the 07-09 delta of −1, at most one person is in this position.
- Releasing a claim that really did send: that person is emailed **twice**. This is the harm
  the claim ledger exists to prevent, and it is the failure mode of the 07-08 incident.

Nothing is deleted. Every claim keeps its original `claimed_at`, and reconciliation adds the
resolution, its evidence, and the timestamp alongside.
