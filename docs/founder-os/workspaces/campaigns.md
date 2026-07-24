# Workspace — Campaigns

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

Four lanes — Social, Reactivation, Partner outreach, Press outreach — all governed by one
lifecycle:

> **Plan → Review → Run → Monitor → Stop**

- **Plan** — objective, audience, copy, schedule (Social weekly planner; wave/audience
  staging; ranked prospect list).
- **Review** — approvals: content gates, audience release decisions (existing approval
  queue + `socialGuidelinesGate`; outreach queue-then-approve; wave-release propose/execute).
- **Run** — the Run/Stop control (existing live-mode authority; campaign command
  functions).
- **Monitor** — sends, delivery, replies, thresholds, exceptions (existing status routes,
  webhook health).
- **Stop** — founder stop, threshold auto-stop, or stop-on-reply — always available,
  always immediate.

The same five words appear in every lane. No lane invents its own jargon or its own
control shapes.

## Internal-to-founder translation table

| Internal mechanism | Founder language |
|---|---|
| heartbeat cron | Next automatic check |
| live mode | Run / Stop |
| autopilot | Campaign running |
| released wave | Audience approved and active |
| threshold trip | Campaign stopped for safety |
| claim ledger | Duplicate-send protection |
| suppression | Not eligible to contact |
| SendGrid webhook health | Delivery feedback connected |

**The translation changes language only; every internal mechanism in the left column
remains the enforcement layer.** The founder surface reads and writes through the
existing functions (`resolveReactivationSendDecision`, `releaseWave`,
`evaluateThresholds`, the claim primitives, `isSuppressed`) — it never re-implements
them, and turning "Run" on still requires every underlying gate to agree before a single
send happens.

## Lane specifics

### Social
Weekly planning session (objective → themes → inputs → concepts → per-platform copy →
approve → copy/export for manual posting → record published URL → results later).
Reuses the post composer with channel variants, the Review Desk approval flow, and the
guidelines/render QA gates. **Manual posting is the product.** The live-publishing
pipeline stays dormant in Advanced.

**Publish Now inheritance rule:** `evidence/publish-now-gate-review.md` shows the manual
Publish Now path still skips `livePostingEnabledForChannel` at current HEAD. The gap is
still open, therefore **the new Campaigns surface must not inherit it**: the Social lane
exposes no Publish Now affordance unless it calls the same live gate the scheduled
worker enforces, and the underlying route is fixed by the audit-fixes PR before any
activation (`08_DELIVERY_PLAN.md` preconditions).

### Reactivation
A real operational control surface over the existing engine, changed in language only:
running/stopped, current audience, released waves, contacts due now, next send window,
sent/delivered/replies/clicks/bounces/complaints/unsubscribes, suppressed count,
safety-threshold status, last successful check, last provider response, and the **exact
reason when sending is blocked** (the decision functions already return reasons —
kill_switch, threshold_tripped, outside window, no claim path). Controls: Run · Stop ·
Resume · Review replies · Review suppressed · Preview next sends · Release next approved
wave — each mapped 1:1 onto existing routes (`/api/reactivation/live-mode`,
`/api/campaign/*`). Example status line:

> Next automatic campaign check: 3:00 p.m. ET
> Campaign running
> 74 contacts eligible in the next window

Roger never sees live gates, autopilot settings, engine IDs, or heartbeat internals.

### Partner outreach
Ranked prospect list with reason-for-inclusion (prospect discovery + scoring), duplicate
and existing-relationship detection (CRM projection), personalized draft →
approve-campaign-or-segment (existing queue-then-approve), bounded follow-ups, immediate
stop on reply (suppression reason `replied`), qualified replies convert to CRM
opportunities with a meeting or follow-up task. Default is never "send everyone."

### Press outreach
**NEW scope** — no press engine exists in main (`01_CURRENT_STATE_REUSE_LEDGER.md` P10).
The lane shares campaign infrastructure (sequences, approvals, claims, stop-on-reply,
suppression) but keeps its audience (journalists/publications, beats, prior coverage),
approved LegalEase facts and claims, story angles, individualized pitches, and coverage
tracking **distinct** from partner and reactivation data. Until built, the lane shows an
honest not-built state — never a fake one.

## Monitor and exceptions

Healthy campaigns are quiet. Exceptions (threshold trip, delivery feedback disconnected,
blocked sends) surface in the lane's Monitor view **and** in Today Needs attention, in
plain language with the one available action.
