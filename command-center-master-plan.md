# LegalEase Command Center — Master Build Plan
### From "glorified HubSpot" to autonomous operating system

This plan has two tracks that run in sequence:
**Track A — Clean up and stabilize what exists** (so you're building autonomy on solid ground, not on tonight's bug pile).
**Track B — Build the autonomous engines** (the around-the-clock system).

Track A first. You do not bolt autonomy onto an unstable, messy app — every bug becomes ten bugs once agents are running unattended. Stabilize, then automate.

---

## TRACK A — CLEAN UP & STABILIZE

### A0. Lock in what's already done (do this first, tonight)
- **Commit all uncommitted work.** The cockpit + the three render-bug fixes + the CSS-collision fix exist only in the running Codespace. Commit them with a clean message, safety core confirmed untouched. Nothing autonomous gets built until the foundation is saved.
- **Push to origin.** Get the ~12 local commits off the machine and onto the remote so a Codespace reset can't wipe months of work.

### A1. Resolve the data-source truth
The single biggest source of "this is messy / fake-feeling": the app runs on a **local JSON sample file**, not live data. Until this is fixed, every number is sample data.
- **Switch the app from local JSON to live Supabase** (the real hosted database). This is the foundational fix that makes everything downstream real.
- Set `APP_BASE_URL` on Render (currently flagged missing).
- Confirm each surface reads from Supabase, not the JSON fallback.
- **Outcome:** numbers stop being sample data and start being real.

### A2. Wire the genuinely-missing real sources
Once on live data, connect the sources that currently say "not yet wired":
- **Stripe** → Revenue box (easy, API key). Highest-value quick win.
- **Expungement.ai signups** → Users box (needs the live consumer DB connection).
- **People-helped / packets-created** → Proof surface (find the real source or keep honest blank).
- **Runway** → cash + burn inputs (manual entry is fine to start).

### A3. Visual / UX cleanup pass
The app looks rough because the live styling drifted from your mockup during the build.
- **Reconcile every surface to the design mockup** (`legalease-command-center.html`) — the cockpit and six tabs should match the clean design, with real data in them.
- **Convert the Proof surface** to the mockup's `command-*` layout (it's the one surface still on the old `proof-*` styling — flagged during the build).
- **Clean up the legacy CSS** (the dead `.growth-board` etc. selectors flagged during the build).
- **Outcome:** the app looks like the thing you designed, populated with real data.

### A4. Resolve the known test/security flags
- Investigate the **secret-exposure test failure** (a `SUPABASE_SERVICE_ROLE_KEY` reference in client HTML). This is a real potential security hole — the all-powerful DB key should never be client-visible. Confirm it's a false positive or fix it. **Do this before the app handles real data and real sending.**
- Resolve the two pre-existing test failures (`test-render-helper-scope`, `test-calendar-readonly-safety`) carried on the cleanup list.

### A5. Rotate exposed keys
- OpenAI and Anthropic keys passed through chat during setup. Rotate them (fresh keys, swap in, takes minutes) before the system goes fully autonomous and unattended.

**Track A exit criteria:** real data flowing, app matches the design, no known security flags, work committed and pushed. *Now* you build autonomy.

---

## CAPABILITY REGISTRY DISCIPLINE

The Command Center should eventually make adding a new capability feel like registering a tool, not building a new mini-app or opening another browser workflow. But LegalEase does not chase a large tool count before the core systems are stable.

**First stabilize the core:** Supabase, Stripe, Gmail/Calendar, and the Command Center UI. Adding capabilities comes after these are trustworthy, not before.

**Every new capability is registered through a standard capability record.** Each record includes:
- name
- purpose
- read/write permissions
- data accessed
- secrets required, and for each: server-only or client-safe (a service-role or write key must be declared server-only and never appear in client output)
- health check
- failure mode
- Command Center surface (where its status is visible)
- whether it can act autonomously
- autopilot toggle, if applicable
- safety/compliance notes

**Rules:**
- A capability is not "connected" until it has a health check, safe failure behavior, and a visible Command Center status.
- Prefer MCP/tool registration where appropriate, but tool count is not a vanity metric.
- Do not add tools just because they are available.
- The goal is controlled capability expansion, not tool sprawl.

**Warning:** A 70-tool architecture is an end-state earned over months. LegalEase is in the stabilization phase. Do not let the end-state pull the build away from Track A.

---

## DEFERRED DECISIONS

**Durable audit history (raised during A1, June 24 2026).** The Supabase reconcile-on-write fix makes the database hold exactly the current in-memory state, same as the old JSON backend. This means audit and activity logs (soc2AuditLogs, activityEvents) are NOT retained as permanent append-only history, only the current window persists. For a justice-tech product under SOC 2, durable audit trails may be required (who approved what, when). If durable audit history is needed, it requires a separate dedicated append-only audit table, designed on purpose, not part of the reconcile fix. Revisit before SOC 2 audit or before any compliance commitment that assumes full audit retention.

**Signup endpoint URL at domain cutover (raised during A2, June 25 2026).** The Users box calls the signup metrics endpoint at https://legaleasepartner.com/api/metrics/signups, because the new Next.js app is currently served on the partner domain, not expungement.ai (still the dead Frappe site). When expungement.ai is cut over to the new app, update this URL in the Command Center caller to the expungement.ai host. Also rotate COMMAND_CENTER_API_KEY at that time (it was printed in chat during setup, low-privilege count-only key, harmless but worth a clean rotation at cutover).

**Heartbeat double-run safety (B1, June 2026).** Correctness relies on a single Render web instance (mutex + idempotency ledger). If scaling to >1 instance, double-run safety MUST move to a Supabase-level atomic claim — see heartbeat.mjs header.

---

## TRACK B — THE AUTONOMOUS ENGINES

Seven engines, hung off one heartbeat. Build in this order — each proven before the next.

### B1. THE SCHEDULER (the heartbeat) — build FIRST
**What it is:** a background worker on a clock that fires runs with no human present (daily run + hourly tick). Nothing is autonomous without it.
**How it's built:** a Render cron job or persistent background worker process. Hourly tick for time-sensitive checks; a daily run (e.g. 6am) for the big batch jobs.
**Why first:** every other engine hangs off this. Prove it fires reliably before building anything that depends on it.

### B2. AUTONOMOUS OUTREACH ENGINE — highest revenue value
**What it does:** upload spreadsheet of orgs → auto-sequence → send on schedule → advance touches → stop on reply.
**Components:**
1. **Spreadsheet ingest** — upload CSV/XLSX of orgs + classification column. Parse → store as RCAP prospects.
2. **Sequence mapping** — map each classification (nonprofit/government/legal-aid/etc.) to the right sequence from the sales playbook. Sequences configurable, not hard-coded.
3. **Scheduled sender** — scheduler sends the right touch on the right day, advances each prospect through the 5 touches, **stops the instant they reply**.
4. **MANDATORY DELIVERABILITY INFRASTRUCTURE** (this is what makes it work, not optional safety):
   - Send through a real email service (SendGrid / Postmark / SES / Instantly / Smartlead) — **never raw Gmail** (domain reputation).
   - Rate-limiting & warm-up ramp (configurable daily cap; start ~20-30/day, not 100 at once).
   - Suppression matrix integration — never email opted-out / replied / do-not-contact.
   - CAN-SPAM compliance — physical address + working unsubscribe + accurate sender in every email.
5. **Autopilot toggle** — default OFF (stage for review) → ON (send autonomously on schedule).
**Explicit guardrails you control (the "scope" you asked for):**
   - Daily send cap (number).
   - Sending window (e.g. only 8am-5pm weekdays).
   - Per-domain throttle (don't hammer one org).
   - Hard stop on reply / bounce / unsubscribe.
   - Optional: require approval for the *first* send to a new batch, then autopilot the rest.

### B3. SELF-HEALING AGENT
**What it does:** watches the system for breakage (failed jobs, errors, a connector down, a send failure), diagnoses the cause, and either auto-fixes known issues or escalates with a *specific* diagnosis (not "something broke" — "the SendGrid key expired, here's the fix").
**How it's built:** a monitoring loop on the scheduler that checks job health + error logs each tick; a diagnosis routine; an escalation path (surfaces to Today + optionally emails/texts you).
**Guardrail:** auto-fix only a whitelist of safe, known issues (retry a failed job, reconnect a dropped connector). Anything outside the whitelist escalates rather than guessing — an agent rewriting its own code unattended is how you get silent corruption.

### B4. ENGAGEMENT & GROWTH MONITOR
**What it does:** pulls post performance + follower/growth rates on a schedule, tracks trends, surfaces what's working.
**How it's built:** scheduled read-only pulls from the social APIs (works as soon as accounts are connected for reading — doesn't need posting approval); trend tracking; surfaces to a Growth/Proof view.
**Note:** read-only, so this can run earlier than posting.

### B5. PROSPECTING AGENT (Le-E scours the net)
**What it does:** searches the web for RCAP-fit orgs (reentry nonprofits, legal aid, county reentry programs, public defenders), classifies them, drops them into the outreach pipeline.
**How it's built:** a scheduled agent using web search + the OpenAI/Anthropic reasoning layer to find + classify orgs; dedupes against existing prospects; feeds B2.
**Guardrail:** new prospects land in a "found, not yet contacted" state. You decide whether discovered prospects auto-enter outreach or wait for a glance (configurable).

### B6. SOCIAL AUTOPILOT
**What it does:** upload a 30-day social plan → an agent posts each day's content on schedule.
**Status:** **build now, dormant.** Gated by LinkedIn/Meta approval (in review). The moment they approve, flip it on and it runs.
**Components:** 30-day plan upload; scheduled publisher; per-channel autopilot toggle; the publishing worker (built but inert until approval + toggle).

### B7. THE LOOP REGISTRY (wire existing loops to the heartbeat)
**What it does:** the loops already designed (cash/runway, support, capacity, aging, etc.) run on the scheduler instead of on-demand — actually watching the business around the clock.
**How it's built:** connect each existing loop to the scheduler's daily/hourly runs; each surfaces to Today when it needs you.

### B8. TECHNICAL SUPPORT ENGINE

**Purpose:** A dedicated support layer for Expungement.ai users, RCAP partners, and internal technical issues. Not buried inside generic loops.

**What it does:**
- Monitors support emails and app issue reports.
- Classifies issues: bug, login/account, payment, packet/status, partner onboarding, legal/process confusion, technical integration, urgent escalation.
- Drafts plain-English support responses.
- Routes urgent or unresolved issues to Today/Cockpit.
- Tracks open and stale unresolved issues.
- Detects repeated issues and turns them into product backlog items.

**UPL is the governing constraint for this engine, not one guardrail among many:**
- The classifier flags ANYTHING touching eligibility, packet status, filing outcome, or legal process as legal-sensitive BY DEFAULT.
- Legal-sensitive issues NEVER auto-send in any autopilot mode. Human review only.
- No reply may state or imply a legal conclusion (qualifies, cleared, filed, complete) unless the source system confirms it, and even then it routes to review.
- Wilma's "guide but never advise" rule applies to every drafted reply.

**Other guardrails:**
- No refund decisions unless explicit rules exist.
- No raw PII in logs or loops.
- Stage-only by default.

**Autopilot modes:**
1. Stage-only: draft replies for review. Default.
2. Autopilot-with-glance: send approved safe-template replies, daily digest. Safe templates exclude anything legal-sensitive.
3. Full autopilot: ONLY login, password, and account-access issues. NOT status, NOT eligibility, NOT packet questions.

Layer 6 — Technical Support / Success Layer (support inbox, user and partner issues, triage, response drafts, escalation).

### B9. WILMA SAFETY TELEMETRY MONITORING

**Purpose:** Surface Wilma's live safety/operational status in the Command Center at a glance, without coupling the two repos.

**Architecture (cross-repo, emit/consume):**
- The consumer dashboard owns its data. It exposes a read-only telemetry summary endpoint computed from `consumer_wilma_telemetry` and the rate-limit/spend store.
- The Command Center polls that endpoint and displays it. It never queries the dashboard's database directly. No shared schema, no cross-repo DB credentials.
- **Auth:** HMAC-verified, same pattern as the existing engine-to-OS telemetry pipe. Read-only, no PII, redacted text only. Summary only, never raw telemetry rows.

**Deterministic summary (not model-generated):** The summary is computed from real counts, NOT model-generated. A model summarizing safety telemetry can hallucinate an "all clear," which is dangerous. Deterministic template over real numbers only.

**Plain-English digest shows:**
- Wilma live vs fallback, per surface
- Conversations today, public landing vs authenticated, separately
- Spend against daily cap (cap-tripped means landing went canned)
- Guard-block / redirect count
- Kill-switch activity
- Error rate, fallback rate, Turnstile rejection count

**Prerequisite (Track A dependency):** The HMAC telemetry pipe must be wired in the Command Center repo before this panel can poll anything. Confirm the pipe is live first.

**Build sequence:**
1. Confirm HMAC telemetry pipe is connected in Command Center.
2. Build the dashboard read-only summary endpoint.
3. Build the Command Center monitoring panel against it (read-only, no controls).

---

## BUILD SEQUENCE (the order you actually execute)

**Stage 1 — Stabilize (Track A):** A0 commit/push → A1 live data → A4 security flag → A2 wire Stripe/sources → A3 visual cleanup → A5 rotate keys.

**Stage 2 — Heartbeat (B1):** build + prove the scheduler.

**Stage 3 — Revenue autonomy (B2):** the outreach engine. Your biggest lever. Includes standing up the email service.

**Stage 4 — Run unattended (B3 + B4):** self-healing + monitoring, so it survives without you watching.

**Stage 5 — Fill the funnel (B5):** the prospecting agent feeding outreach.

**Stage 6 — Social (B6):** built now/dormant; goes live when platforms approve.

**Stage 7 — Full loops (B7):** wire all loops to the heartbeat.

---

## WHAT YOU NEED TO GATHER (parallel, while building)

- The **5-touch email sequences** from your sales playbook (copy per touch, per classification if they differ).
- A decision + account for the **email-sending service** (recommendation comes in the outreach Phase 0).
- **Stripe API key** (for Revenue).
- **Anthropic credits** (to activate Claude — currently wired but unfunded).
- Your **physical mailing address** + unsubscribe handling (for CAN-SPAM).
- The **30-day social plan** (for when social autopilot goes live).

---

## THE AUTONOMY DIAL (how much runs without you)

Every engine has an autopilot toggle, default OFF. This is your control surface. You can run the whole thing in any of three modes, per engine:
- **Stage-only** — system prepares everything, you approve. (Start here to see what it produces.)
- **Autopilot-with-glance** — system runs autonomously, you get a daily digest you *can* check but don't have to.
- **Full autopilot** — runs completely unattended.

You turn the dial up engine by engine as each one earns your trust. The switches are real and they're yours. The architecture supports full autonomy on day one; the dial just lets you decide when.

---

## GUARDRAILS SUMMARY (the explicit scope, in one place)

These exist because they make autonomy *work*, not to slow you down:
- **Email:** real sending service, rate caps, warm-up, suppression, CAN-SPAM. (Skipping these = blacklisted domain.)
- **Self-healing:** auto-fix a whitelist; escalate everything else. (Skipping = silent corruption.)
- **Prospecting:** discovered prospects land staged or auto-enter, your choice.
- **Social:** can't post until platforms approve — not a choice, a platform rule.
- **Per-engine autopilot toggles:** off by default, you flip them.
- **Safety core stays intact:** suppression, approval-as-distinct-from-execution, no-raw-PII, read-only Google — these remain the substrate the autonomy runs on.
