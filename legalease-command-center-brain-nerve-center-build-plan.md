# LegalEase Command Center — Brain / Nerve Center Build Plan

## Executive summary

The Command Center should become the LegalEase operating system.

The goal is not “more dashboards.” The goal is one simple command surface where Roger can monitor the company, approve high-risk actions, and let agents handle everything else.

The current repo already has a lot of built infrastructure: custom Node server, Supabase store, heartbeat engines, auth, SendGrid paths, daily operating rituals, partner modules, proof/compliance surfaces, social connectors, growth engines, and lifecycle sync. The problem is not lack of machinery. The problem is that the machinery is not yet organized into a single easy operating experience.

The new build strategy:

1. Verify the real repo/prod state.
2. Fix the trust blockers.
3. Collapse the UI into one “Today at LegalEase” operating screen.
4. Make every engine write to one unified Queue.
5. Build a shared company memory layer: Contacts, Organizations, Events, Agent Runs, Approvals.
6. Let agents monitor, draft, classify, recommend, and prepare work.
7. Keep dangerous actions approval-gated.
8. Add autonomy gradually through explicit safety levels.

---

# What the attachment changes

## 1. The app is already a large operating system, not a blank dashboard

The attached status file says the current runtime is a single custom Node HTTP server, `scripts/preview-server.mjs`, serving both JSON API routes and the server-rendered dashboard. It also says the app has roughly 60 sibling runtime modules, Supabase persistence, token auth, heartbeat automation, Render hosting, and minimal runtime dependencies.

So the next build should not start by creating a new architecture. It should organize and simplify the existing one.

## 2. There are already many operator surfaces

The attachment says the app already has eight nav sections: Cockpit, Today, Growth, Partners, Production, Proof, Settings & Health, and Le-E. It also says these sections contain many sub-pages and are live, though some data tiles are honest-zero until sources are wired.

So the UI problem is not “missing pages.” The UI problem is that the operator experience is too spread out. The solution is one primary cockpit that summarizes the company and routes Roger only where needed.

## 3. The automation backbone already exists

The heartbeat model already runs plan/act loops. The attached file says `plan()` always runs side-effect-free, while `act()` only runs when the engine autopilot toggle is on. It also describes mutex, heartbeat ledger, and lease protections.

That is the correct backbone for autonomy. We should extend it, not replace it.

## 4. Most risky engines are already gated

The attachment says only three engines have real side-effect paths: B1 reactivation, B2 outreach, and B5 promotion. It says they are inert behind stacked gates, while B3/B4/B7 are plan-only monitors.

That means autonomy can increase safely if we preserve the pattern: monitor freely, draft freely, act only when approved or clearly safe.

## 5. There are urgent trust blockers

The attachment flags a blocker around stale production deploy/write conflict, SendGrid webhook telemetry, missing signature verification, and historical bounce backfill. It says the old prod write path could fail full-state writes and break webhook telemetry/autopilot toggles.

This must be treated as a “trust layer” issue: before making the system more autonomous, make sure its telemetry, writes, deploy state, and safety checks are trustworthy.

## 6. Some “missing” pieces are now more specific

The attachment names specific remaining gaps: B8 technical support engine, B9 Wilma safety telemetry monitor, durable outbox/dead-letter job model, reply triage, attribution/metrics, Instagram audience import, `/api/rcap-revenue/preview`, and non-consumer upload types.

These should be integrated into the roadmap.

---

# Product philosophy

## The Command Center should feel like a chief of staff

The UI should answer:

1. What changed?
2. What matters?
3. What needs Roger?
4. What did the system already handle?
5. What is blocked?
6. What should happen next?

The system should not expose engineering language unless Roger opens a diagnostic panel.

Bad UI language:

* engine registry
* act path
* heartbeat lease
* autopilot seed
* live-send flag
* route
* JSON state
* collection
* reducer
* queue mutation

Good UI language:

* Needs review
* Ready to approve
* Running safely
* Blocked
* Draft ready
* Import ready
* People stuck
* Partner needs follow-up
* Campaign paused
* Production behind
* Money changed
* Something broke

---

# Autonomy model

The Command Center should use five autonomy levels.

## Level 0 — Off

Nothing runs.

Use for:

* new engines
* untrusted integrations
* dangerous workflows

## Level 1 — Monitor

The system reads and summarizes.

Allowed:

* health checks
* Gmail scan
* Calendar scan
* Stripe summary
* SendGrid stats
* campaign metrics
* partner activity
* product funnel
* source QA

No writes except internal cached metrics and agent-run logs.

## Level 2 — Draft

The system prepares work.

Allowed:

* email drafts
* support replies
* social drafts
* partner follow-up drafts
* meeting briefs
* campaign copy drafts
* PR fix prompts
* reports
* onboarding checklists

No external action.

## Level 3 — Queue for approval

The system creates approval items.

Allowed:

* approve email send
* approve contact import
* approve held-contact release
* approve wave schedule
* approve partner page draft
* approve social post
* approve report export
* approve PR branch creation

## Level 4 — Execute approved action

The system performs an action after approval.

Allowed:

* send an approved email
* create Gmail draft
* import approved contacts
* release approved contacts from hold
* schedule an approved wave
* publish approved social content
* create approved PR branch

## Level 5 — Safe autopilot

Only for internal, non-human-facing, reversible or low-risk tasks.

Allowed:

* classify inbox
* generate daily brief
* update internal metrics
* dedupe contacts
* create Queue items
* refresh dashboards
* run QA monitors
* mark stale items
* detect anomalies

Never automatic:

* send human-facing messages
* deploy production
* merge PRs
* change legal rules
* publish legal content
* change packet templates
* charge/refund money
* release campaign waves
* turn on live-send gates
* clear campaign holds
* enroll contacts
* expose sensitive data

---

# Core architecture to build around

## 1. One Queue

Everything important should become a Queue item.

Queue item types:

* approve email
* approve campaign action
* approve import
* review held contact
* release-from-hold candidate
* support issue
* data/privacy request
* refund/payment issue
* partner follow-up
* prospect follow-up
* meeting prep
* social approval
* report approval
* deploy warning
* codebase health issue
* source QA issue
* onboarding task
* revenue alert
* funnel alert
* campaign safety alert

Queue statuses:

* new
* needs Roger
* drafted
* approved
* scheduled
* done
* snoozed
* blocked
* dismissed

Every item must answer:

* What happened?
* Why does it matter?
* What does the system recommend?
* What happens if Roger approves?
* Is this safe?
* What is the fallback?

## 2. Shared company memory

The Command Center needs unified objects.

### Contact

One record for every person.

Types:

* consumer
* paid customer
* abandoned screening
* checkout abandonment
* partner contact
* prospect
* funder
* investor
* vendor
* attorney/legal partner
* support contact
* media contact
* internal user

### Organization

One record for each company, nonprofit, agency, funder, city, county, partner, or vendor.

Types:

* RCAP partner
* RCAP prospect
* funder
* city/county
* workforce organization
* legal aid
* reentry organization
* advocacy organization
* employer
* vendor

### Event

Every meaningful thing that happens.

Examples:

* screening started
* checkout abandoned
* payment succeeded
* email received
* email drafted
* campaign wave released
* support issue opened
* partner page published
* meeting held
* PR merged
* deploy verified

### Agent run

Every agent execution.

Fields:

* agent
* trigger
* input summary
* output summary
* confidence
* actions proposed
* writes performed
* errors
* timestamp

### Approval

Every risky action.

Fields:

* proposed action
* preview
* risk level
* approved by
* approved at
* executed at
* verification result

---

# The one-page UI

The main page should be called:

## Today at LegalEase

It should be a single scrollable operating page.

### 1. Good morning, Roger

Plain-English summary.

Example:

> Yesterday, 42 people started screenings, 11 reached checkout, 4 paid, and 7 abandoned checkout. Two support issues need review. One partner needs follow-up. Production is current. No campaign safety thresholds were breached.

### 2. Needs Roger

Only the decisions that need Roger.

Each item has:

* recommended action
* approve button
* snooze button
* dismiss button
* “why this matters”

### 3. Running automatically

Quiet status.

Examples:

* Inbox triage running
* Campaign monitor running
* Revenue monitor running
* Partner monitor running
* Source QA monitor running

Only show details if something is wrong.

### 4. Watchlist

Things that could become problems.

Examples:

* SendGrid bounces
* domain reputation
* stale deploy
* failed writes
* high checkout abandonment
* partner inactivity
* support spike
* source freshness risk

### 5. Money

Plain-English revenue view:

* today
* week
* month
* consumer revenue
* partner revenue
* failed payments
* refunds
* unusual changes

### 6. People stuck

Lifecycle/funnel view:

* abandoned screenings
* checkout abandonments
* completed-not-paid
* paid users
* held contacts
* approved-for-later contacts
* suppressed users

### 7. Partners and prospects

RCAP operating view:

* hot prospects
* follow-ups due
* onboarding blocked
* live partners
* partner activity
* reports due

### 8. Meetings today

Calendar-derived briefs:

* who
* why it matters
* relationship history
* suggested ask
* follow-up draft

### 9. Drafts ready

Everything drafted by agents:

* emails
* support replies
* social posts
* partner reports
* outreach
* meeting follow-ups

### 10. System health

Quiet unless something is wrong.

Show:

* production commit
* GitHub main commit
* Render deploy state
* Supabase health
* SendGrid webhook health
* heartbeat health
* failed writes
* auth failures
* live gate posture

---

# Phase 0 — Ground truth and trust repair

## Goal

Before adding more autonomy, verify the actual repo and production state.

The attached file is point-in-time and explicitly says live send-gate posture and deploy state change over time, so verification must happen through `/api/version`, `/api/heartbeat/status`, and `/api/reactivation/status`.

## Build tasks

1. Repo audit
2. Production commit verification
3. Supabase write-path verification
4. SendGrid webhook verification
5. SendGrid webhook signature verification plan
6. Reactivation telemetry check
7. Autopilot toggle check
8. Heartbeat status check
9. Current Settings page audit
10. Current UI surface audit

## Immediate trust fixes

### Fix 0.1 — Deploy/version truth panel

Build a simple internal panel:

* GitHub main commit
* production commit
* whether production is behind
* latest deploy status if available
* last smoke test
* version mismatch warning
* what to do next

No auto-deploy.

### Fix 0.2 — SendGrid webhook hardening

Must include:

* real signature verification
* webhook event counters
* `lastWebhookAt`
* delivered/bounce/spam/unsub/click counts
* webhook failure log
* safe partial writes only
* dashboard warning if webhook has not received events

### Fix 0.3 — SendGrid historical backfill

Use a reliable source:

* Suppressions API
* Event Webhook export
* manual SendGrid export if needed

Do not trust the existing buggy historical query until verified.

### Fix 0.4 — Full-state write safety monitor

Because the attachment warns about Supabase persistence pitfalls and silent failure risks, the system needs a visible write-health monitor. The storage model has an allow-list of persisted collections, and new collections must be added there or they silently fail to persist.

Build:

* last successful write
* failed write count
* collection persistence check
* unknown collection warning
* write conflict warning
* Supabase pagination check

---

# Phase 1 — Brain foundation

## Goal

Make one operating layer above all engines.

## Build tasks

1. Unified Queue schema
2. Company Contact schema
3. Organization/Account schema
4. Event timeline schema
5. Agent run log
6. Approval log
7. Today at LegalEase page
8. Needs Roger section
9. Watchlist section
10. System health section

## Key rule

Do not delete existing pages. Hide complexity behind the main screen. Existing surfaces become drill-downs.

## Acceptance criteria

* Roger can understand the business in under 60 seconds.
* Every important engine can write Queue items.
* Every risky action has an Approval object.
* The main page uses plain English.
* No terminal required for routine monitoring.

---

# Phase 2 — Dead-simple intake

## Goal

Any import should be one button, one preview, one clear decision.

## Build tasks

1. Universal upload flow
2. File type detection
3. Header-only inspection
4. Sensitive field warnings
5. Preview-only classification
6. Plain-English import summary
7. Approval before write
8. Verification after write

## Supported intake types

* Expungement.ai lifecycle CSV
* consumer reactivation list
* RCAP prospects
* partner contacts
* RCAP revenue workbook
* social calendar
* support list

The attachment says consumer list import and Expungement.ai lifecycle sync exist, but other upload types are still stubbed or route-reuse.

## UI copy

Instead of:

> Select import type

Use:

> What is this list?

Options:

* People who used Expungement.ai
* People stuck at checkout
* RCAP prospects
* Partner contacts
* Social content calendar
* Revenue workbook
* Something else

Then ask:

> What should happen after import?

Options:

* Review only
* Add to Contacts
* Hold for campaign review
* Create follow-up tasks
* Draft outreach
* Suppress / do not contact

## Hard rule

No import sends anything.

---

# Phase 3 — Campaign command without terminal

## Goal

Campaigns become controllable from the UI.

## Build tasks

1. Campaign overview in plain English
2. Audience picker
3. Sequence picker
4. Send preview
5. Suppression/blocked reason preview
6. Date-scheduled wave release
7. Wave release approval
8. Pause/resume controls
9. Threshold monitor
10. SendGrid telemetry confirmation

## Special caution

The attachment says the reactivation campaign had released waves `[1, 2]`, gates off, and Wave 2 primed; flipping both gates could resume sends and also trigger Wave 1 Touch 2 by cadence.

So campaign controls need very clear previews:

* who will send
* when
* which touch
* which wave
* why now
* estimated volume
* safety thresholds
* gate state
* suppression count

## Acceptance criteria

* No shell commands needed.
* Roger can schedule a wave from UI.
* Roger sees exactly what will happen before enabling anything.
* SendGrid telemetry must be trusted before autonomy increases.

---

# Phase 4 — Revenue brain

## Goal

Revenue becomes a monitored loop, not a static dashboard.

## Build tasks

1. Stripe health check
2. Consumer vs partner revenue split
3. Daily/weekly/monthly revenue
4. Failed payment detection
5. Refund detection
6. Partner invoice/payment tracking
7. Revenue anomaly alerts
8. Queue items for money issues

The attachment says Stripe is wired into revenue/signups in Track A, but the revenue surface still needs plain-English operational work and consumer/partner split.

## Output examples

* “Revenue yesterday: $X”
* “Consumer revenue down 21% vs prior 7-day average”
* “Two failed payments need follow-up”
* “One partner invoice is overdue”
* “Checkout starts increased but paid conversions fell”

---

# Phase 5 — Growth and lifecycle brain

## Goal

Know where users are stuck and what should happen next.

## Build tasks

1. Funnel event ingestion
2. Screening starts
3. Screening completions
4. Checkout starts
5. Checkout abandonments
6. Paid conversions
7. Packet generation
8. State/jurisdiction breakdown
9. Lifecycle Queue items
10. Held contact release preview
11. Release-from-hold confirm, no send
12. Lifecycle campaign lanes

## Campaign lanes

* MVP user reactivation
* Expungement.ai screening abandoned
* Expungement.ai checkout abandoned
* completed-not-paid
* paid customer follow-up
* RCAP consumer follow-up
* partner prospect outreach

Each lane has:

* audience
* count
* held count
* approved count
* suppressed count
* send readiness
* safety status
* next recommended action

---

# Phase 6 — Inbox and reply brain

## Goal

Roger stops sorting email manually.

## Build tasks

1. Gmail read triage
2. Email classification
3. Urgency detection
4. Contact matching
5. Organization matching
6. Draft reply generation
7. Queue approval
8. Gmail draft creation after approval

The attachment says Google Workspace is currently read-only and cannot post by design.

So this phase has a dependency:

* Gmail compose scope must be approved before the system can create drafts.

Before compose scope:

* classify only
* summarize only
* prepare draft text inside Command Center only

After compose scope:

* create Gmail draft only after approval

Never auto-send.

---

# Phase 7 — Support brain

## Goal

Support becomes triaged, drafted, and tracked.

## Build tasks

1. Support intake source
2. Support categories
3. Urgency scoring
4. Customer matching
5. Draft response
6. Queue approval
7. Refund/payment routing
8. Data/privacy request routing
9. Legal-sensitive flagging

Categories:

* login/account
* payment
* refund
* packet issue
* technical bug
* eligibility/legal question
* partner referral
* data deletion/privacy
* complaint
* urgent

Hard rules:

* no legal advice
* no auto-send
* no customer record mutation without approval
* data deletion gets special workflow

This maps to the attached missing B8 technical support engine.

---

# Phase 8 — RCAP sales and prospect brain

## Goal

Make RCAP sales systematic.

## Build tasks

1. Prospect database
2. Contact enrichment
3. Organization scoring
4. Government/employer sourcing
5. Outreach drafting
6. Follow-up scheduling
7. Meeting prep
8. Pipeline state
9. Partner brief generation

The attachment says B5 prospect discovery exists for IRS BMF + LSC org sourcing, but promoted orgs carry no email and do not auto-enroll.

So the next RCAP gap is contact enrichment and pipeline operations.

Pipeline stages:

* sourced
* qualified
* contact found
* outreach drafted
* contacted
* follow-up due
* meeting scheduled
* interested
* proposal sent
* onboarding
* live
* inactive

Hard rule:

* no outreach send without approval.

---

# Phase 9 — Partner onboarding brain

## Goal

Every RCAP partner launch becomes repeatable.

## Build tasks

1. Partner profile
2. Partner contacts
3. Launch checklist
4. Intake link setup
5. Co-branded page draft
6. QR code/share kit
7. Training checklist
8. Dashboard access checklist
9. Reporting schedule
10. Impact report setup

Existing partner modules should be used where possible. The attachment says partner lifecycle, partner program engine, and journey handoff contract are live.

## Statuses

* prospect
* intro scheduled
* interested
* pilot proposed
* agreement pending
* onboarding
* launch ready
* live
* inactive

---

# Phase 10 — Meeting brain

## Goal

Every important meeting gets a brief.

## Build tasks

1. Calendar scan
2. Attendee matching
3. Contact/account history
4. Email history summary
5. Partner/prospect context
6. Suggested agenda
7. Recommended ask
8. Objection handling
9. Follow-up draft

Output:

* “Who this is”
* “Why it matters”
* “What happened before”
* “What to ask”
* “What to avoid”
* “Suggested follow-up”

No auto-email.

---

# Phase 11 — Social/content brain

## Goal

Social content is drafted and queued without manual grind.

## Build tasks

1. Content calendar
2. Draft generation
3. Platform variants
4. Wilma reel scripts
5. Approval queue
6. Publishing schedule
7. Performance tracking
8. Attribution

The attachment says LinkedIn, X, Meta, Threads connectors are built or partially built but live gates are off, and B6 social autopilot is deferred pending approvals.

So first build:

* draft-only
* approval queue
* performance tracking

Publishing can remain gated.

---

# Phase 12 — Proof, impact, and investor brain

## Goal

Proof assets become continuously updated.

The attachment says Proof already includes metrics, evidence room, reports, data room, SOC 2 suite, access/audit/changes/vendors/incidents/evidence/policies.

Build the brain layer on top:

1. Partner impact reports
2. Funder reports
3. Investor updates
4. SOC 2 evidence reminders
5. Monthly proof packet
6. Public-safe metrics
7. Data room freshness alerts

Hard rules:

* no personal identifiers in public reports
* aggregate by default
* no raw criminal record details

---

# Phase 13 — Source, packet, and Wilma QA brain

## Goal

Protect the 50-state + DC legal engine.

Build:

1. Source freshness monitor
2. Broken form link monitor
3. Packet generation failure monitor
4. State risk dashboard
5. Wilma safety telemetry monitor
6. User confusion pattern detector
7. QA Queue items

This maps to the attached missing B9 Wilma safety telemetry monitor.

Hard rules:

* no auto legal-content changes
* no auto state-rule changes
* no packet-template mutation without review

---

# Phase 14 — Durable job/outbox model

## Goal

Make automation reliable enough for higher autonomy.

The attachment says the durable outbox/dead-letter job model is not yet built.

Build:

1. Outbox table/collection
2. Job lease
3. Retry count
4. Dead-letter state
5. Idempotency key
6. Job type
7. Last error
8. Next retry time
9. Manual retry button
10. Failed job Queue items

Use for:

* email drafts
* SendGrid sends
* imports
* report generation
* social publishing
* webhook processing
* partner page publication
* backfills

This is critical before higher autonomy.

---

# Phase 15 — Self-healing brain

## Goal

The system diagnoses and proposes fixes.

Build:

1. Production health watcher
2. Version mismatch detector
3. Failed route detector
4. Webhook failure detector
5. Test failure summarizer
6. Codex prompt generator
7. Proposed branch/PR creator
8. Deploy checklist generator

Hard rules:

* no auto-merge
* no auto-deploy
* no production mutation
* no secret exposure

Output:

* “I found the issue.”
* “Here is the proposed fix.”
* “Here is the PR risk.”
* “Approve merge/deploy?”

---

# Phase 16 — Settings simplification

## Goal

Settings become understandable.

Seven sections:

1. Company
2. Products
3. Email & Sending
4. Campaign Safety
5. Integrations
6. Admin Users
7. Diagnostics

Each setting says:

* what it controls
* current state
* whether it affects production
* risk level
* what happens if changed

Dangerous settings require:

* owner/admin
* confirmation
* preview
* approval log

---

# Immediate build order

## First 10 moves

1. Ground-truth repo/prod audit
2. Deploy/version truth panel
3. SendGrid webhook hardening and observability
4. Unified Queue schema
5. Contact + Organization schema
6. Event timeline + Agent run log + Approval log
7. Today at LegalEase single-page cockpit
8. Needs Roger section
9. Dead-simple upload flow
10. Campaign command shell with date-scheduled wave release

## Next 10 moves

11. Revenue brain
12. Growth/funnel brain
13. Held-contact release preview
14. Release-from-hold confirm, no send
15. Inbox triage
16. Support brain
17. RCAP prospect/contact enrichment
18. Partner onboarding brain
19. Meeting brief agent
20. Social draft agent

## Later moves

21. Impact reporting brain
22. Source/packet/Wilma QA brain
23. Durable outbox/dead-letter model
24. Settings rebuild
25. Self-healing brain

---

# What to build next

The next prompt should not build a new feature yet.

The next prompt should run a repo/prod audit that reconciles:

* the attached status document
* current GitHub main
* current production commit
* current live engine posture
* current SendGrid telemetry
* current Supabase write health
* current UI surfaces
* current Settings page
* current Queue/Contacts reality

Then Phase 1 starts from ground truth.
