# 00 — Read Me First

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

This package is the product authority for the Founder OS consolidation of the LegalEase
Command Center. It is documentation only: it decides and records; it changes no code, no
deploys, no environment, no heartbeat, no gates. Evidence for every claim was regenerated
at commit `a3793c3` (see `evidence/`).

## What this package establishes

- **Roger is the primary operator.** The product is built for one founder running the
  company, not for a team of operators or for the engineers who built the machinery.
- **The operating target is fewer than four focused hours per day.** Every design decision
  is tested against that number.
- **The current foundation must be reused.** The engines, storage, gates, and tests that
  exist today are the implementation. The work is consolidation — hiding machinery,
  collapsing duplicate pages, and connecting existing functions into end-to-end workflows —
  not a rewrite.
- **Four primary workspaces are the only primary navigation:** Today, Relationships,
  Campaigns, Scoreboard.
- **Global controls:** Search, Create, Le-E, Settings. Nothing else is global.
- **Contextual capabilities, not destinations:** Inbox, Support, Calendar, Files, and
  Company Health surface inside the four workspaces where the work happens.
- **Internal machinery belongs in Advanced or remains invisible:** agents, engines,
  queues, logs, live gates, operating memory, heartbeat internals, review states, storage,
  and provider diagnostics are not product surfaces.
- **Existing safety controls must not be weakened.** The enforcement points verified in
  `evidence/safety-gates.md` are non-negotiable; any relocated surface calls the same gate
  functions (see `06_SAFETY_AND_AUTOMATION_CONTRACT.md`).
- **No new standalone page may be introduced unless the product authority is updated.**
  A capability that cannot live inside Today, Relationships, Campaigns, or Scoreboard is a
  charter change, and the charter changes before the page exists.

## Document precedence

When documents conflict, this order governs:

1. product charter
2. end-to-end workflow contracts
3. current-state reuse and migration ledger
4. safety, data, and technical contracts
5. existing historical documentation
6. code comments and implementation notes

## How to read this package

| Read | To learn |
|---|---|
| `01_CURRENT_STATE_REUSE_LEDGER.md` | What exists, what is trusted, and what happens to each capability |
| `02_TARGET_PRODUCT_AND_IA.md` | What Roger sees, and where every existing route lands |
| `workflows/` (12 files) | The end-to-end jobs the product must complete |
| `workspaces/` (4 files) | The contract for each primary workspace |
| `05_DATA_AND_INTEGRATION_CONTRACT.md` | Entities, stores, and the infrastructure boundary |
| `06_SAFETY_AND_AUTOMATION_CONTRACT.md` | Confirmation policy and the non-negotiable protections |
| `07_MIGRATION_AND_DEPRECATION_LEDGER.md` | The fate of every page, route, and button |
| `08_DELIVERY_PLAN.md` | Six vertical releases, their preconditions, and the acceptance standard |
| `evidence/` | Regenerated proof at `a3793c3` for every claim above |

## Historical documents — not authoritative

The repository contains earlier master plans, build plans, and IA efforts. They are
valuable implementation context and remain untouched, but wherever any of them conflicts
with this package, **this package wins**. Each of the following is declared historical,
not authoritative:

- `docs/COMMAND_CENTER_BUILD_PLAN.md` — system map and build-phase roadmap
- `docs/PHASE18_BRAIN_PLAN.md` — Phase 18 cockpit/brain plan
- `docs/USABILITY_OVERHAUL_PROPOSAL.md` — prior usability proposal
- `docs/INBOX_INTELLIGENCE_PROPOSAL.md` — inbox intelligence proposal (its decision record `docs/decisions/2026-07-12-inbox-full-read-roger-legalease.md` remains a binding privacy decision; only its product-surface framing is superseded)
- `docs/command-center-state-of-art-architecture.md` — architecture vision
- `docs/command-center-ground-truth-audit.md` — earlier audit
- `docs/product-contract.md` — earlier product contract
- `docs/architecture-map.md` — architecture map
- `docs/founder-language-guide.md` — founder-language registry (its plain-language principle is carried forward by this package; the document itself is context)
- `docs/ux-vnext/` — the entire vNext IA corpus (79 files, including `route-map.md`, `capability-map.md`, `legacy-alias-map.md`, `legacy-deprecation.md`, and the vNext destination taxonomy of 13 surfaces). The vNext registry classifications remain useful evidence of current wiring (`evidence/route-inventory.md`) but its 13-destination IA is superseded by the four-workspace charter.
- `docs/GROUND_TRUTH_2026-07-13.md` — remains the verbatim record of real business data at its date; it is a data record, not a product plan, and nothing here alters it.

Do not edit those files. They stay as history.

---

## Authoritative Product Charter

The following charter is the supplied founder vision and is the product authority for
this package.

# LegalEase Command Center — Product Vision

> **Status:** Authoritative product charter for the Founder OS consolidation effort.

You're right. We built a lot of machinery and then exposed the machinery instead of building a simple operating experience.

**The Command Center should not be a collection of pages, logs, queues, settings, agents, and buttons.** It should be a solo-founder operating system that helps you finish the day's work in under four hours.

Based on everything you have said across all of these iterations, this is the product.

# The core purpose

Every time you open the Command Center, it should answer five questions:

1. **What needs my attention right now?**
2. **Who is waiting on me, and who am I waiting on?**
3. **What is running automatically, and does anything need intervention?**
4. **Are we making progress financially, operationally, and commercially?**
5. **What is the next highest-value thing I should do?**

Nothing else deserves primary navigation.

# The entire product should have four primary workspaces

## 1. Today

This is where you should spend most of your time.

Today is not a dashboard. It is an **ordered work queue** that combines everything requiring your attention:

* Emails requiring a response
* Partner, investor, press, vendor, and prospect follow-ups
* Commitments you made in email or meetings
* People who owe you something
* Customer-support issues
* Upcoming meetings and preparation
* Post-meeting follow-ups
* Campaign replies
* Automation exceptions
* Approvals that actually require your judgment
* Important platform-health problems
* Your three most important outcomes for the day

The page should have five simple sections:

### Now

The single most important item, with the action available directly on the page.

### Next

The next two to five items, ranked by urgency and business value.

### Communications

Messages and follow-ups requiring a response.

### Meetings

Today's agenda, preparation, and follow-up obligations.

### Needs attention

Customer escalations, automation problems, platform incidents, or KPI anomalies.

Every item should open the same clean action panel. No generic logging page. No artifact viewer. No hunting for the correct module.

From that panel, you should be able to:

* Read a concise summary
* See the relevant relationship history
* Draft a response
* Copy or open the response in Gmail
* Mark it sent
* Complete the related task
* Set the next follow-up
* Snooze it
* Mark it waiting
* Mark it blocked
* Add a note
* Open the full relationship only when necessary

Completing an action should automatically update every related part of the system. You should not have to send an email, return to a task, manually log the email, update the CRM, and then create another task.

One completed communication should:

1. Record the interaction.
2. Complete the current task.
3. Update the relationship's last-contact date.
4. Stop any inappropriate automated sequence.
5. Set or request the next follow-up.
6. Remove the item from Today.

That is what "complete the work in the platform" means.

---

## 2. Relationships

This is the CRM.

It should contain every important person and organization:

* Partners
* Partner prospects
* Investors
* Press contacts
* Vendors
* Customers
* Referral sources
* Internal team members
* Contractors
* Other strategic relationships

The default screen should be one clean table or pipeline, not multiple disconnected databases.

Each row should show:

* Person or organization
* Relationship type
* Current stage
* Strategic priority
* Last inbound communication
* Last outbound communication
* Who owes the next move
* Next follow-up date
* Current task
* Open commitment
* Automated outreach status
* Suppression or eligibility status

The most useful filters are:

* Follow-up due
* Overdue
* Waiting on me
* Waiting on them
* No contact in 14, 30, or 60 days
* Replied
* Meeting booked
* Proposal active
* Stalled
* In automated outreach
* Suppressed
* Investors
* Partners
* Press
* Vendors
* Customers

A relationship record should have one timeline containing:

* Emails
* Meetings
* Notes
* Tasks
* Commitments
* Campaign activity
* Replies
* Files
* Support issues
* Stage changes

Primary actions should be:

* Draft follow-up
* Set next action
* Complete next action
* Add task
* Add note
* Schedule or open meeting
* Pause automation
* Suppress contact
* Add file

"Log activity" should be secondary. Most activity should be recorded automatically as a byproduct of doing the work.

The CRM also needs to understand that one person can have multiple roles. A person might be an investor, referral source, and Partner contact. They should not become three unrelated records.

---

## 3. Campaigns

Campaigns should contain four clear lanes.

### Social

You plan Social weekly, but post manually.

The weekly workflow should be:

1. Choose the week's business objective.
2. Choose one to three themes.
3. Add the facts, announcements, insights, proof, or offers available.
4. Generate several content concepts.
5. Create distinct copy for each selected platform.
6. Edit and approve it.
7. Copy or export it for manual posting.
8. Record the published URL.
9. Add or retrieve results later.

Supported drafts:

* LinkedIn
* Instagram
* Facebook
* X
* Threads
* Newsletter or founder update when useful

The drafts should not be the same paragraph shortened five times. Each platform needs its own hook, structure, length, CTA, and formatting.

No built-in image generation is necessary. No automatic Social posting is necessary.

A simple asset brief is enough:

* Suggested visual
* Headline
* Supporting copy
* Screenshot or photo idea
* Dimensions
* Alt text

### Reactivation

This should be a real operational control surface for the existing SendGrid campaign.

It should clearly show:

* Running or stopped
* Current audience
* Released waves
* Contacts due now
* Next scheduled send window
* Sent
* Delivered
* Replies
* Clicks
* Bounces
* Complaints
* Unsubscribes
* Suppressed contacts
* Safety-threshold status
* Last successful heartbeat
* Last provider response
* Exact reason when sending is blocked

The operator controls should be obvious:

* Run
* Stop
* Resume
* Review replies
* Review suppressed contacts
* Preview next sends
* Release the next approved wave

It should never require you to understand live gates, autopilot settings, engine IDs, or heartbeat internals.

The heartbeat should be invisible infrastructure. The page should simply say:

> Next automatic campaign check: 3:00 p.m. ET
> Campaign running
> 74 contacts eligible in the next window

### Partner prospect outreach

This should:

* Maintain a list of prospective Partner organizations
* Explain why each is a fit
* Identify the likely contact
* Detect existing relationships and duplicates
* Score strategic value
* Draft personalized outreach
* Let you approve a campaign or segment
* Automate bounded follow-ups
* Stop immediately after a reply
* Convert qualified replies into CRM opportunities
* Create a meeting or follow-up task

The default should not be "send everyone." It should be a ranked list with a clear reason for inclusion.

### Press outreach

This should work similarly to a focused PR-assistant system:

* Maintain journalists and publications
* Track beats and relevant prior coverage
* Store approved LegalEase facts and claims
* Develop story angles
* Draft individualized pitches
* Approve a campaign
* Automate follow-ups within limits
* Stop on reply
* Track coverage, links, and relationship history

Press, Partner outreach, and reactivation can share campaign infrastructure, but their audiences, claims, copy, stop rules, and reporting should remain distinct.

Every campaign lane should use the same simple lifecycle:

> Plan → Review → Run → Monitor → Stop

Not separate jargon and controls for each engine.

---

## 4. Scoreboard

This is where you understand whether LegalEase is healthy.

It should not be a collection of technical reports. It should be a founder scoreboard with a small set of trusted numbers.

### Financial

* Cash currently available
* Revenue collected this month
* Refunds
* Monthly burn
* Runway
* Accounts payable or upcoming obligations
* Expected or weighted pipeline

### Acquisition and conversion

* Website visits
* Qualified visits
* Signups
* Intake starts
* Intake completions
* Purchases
* Activated customers
* Conversion rates
* Source attribution

### Relationships and pipeline

* Active Partner opportunities
* New prospects
* Follow-ups due
* Replies
* Meetings booked
* Proposals active
* Stalled opportunities
* Weighted pipeline value

### Customer experience

* New support issues
* Waiting on LegalEase
* Urgent issues
* Median response time
* Resolved this week
* Refund requests
* Recurring problem categories

### Marketing

* Social drafts ready
* Posts published
* Traffic or signups attributable to content
* Reactivation sends and conversions
* Partner outreach replies
* Press pitches, replies, and placements

### Platform health

* Application
* Database
* Authentication
* Gmail and Calendar
* SendGrid
* Stripe
* Website analytics
* Background jobs
* Backups

Every value must show:

* **Live**
* **Manual**
* **Unavailable**
* **Needs attention**

And:

* Source
* Last updated
* Current period
* Previous period
* Target
* Variance

No fake zeroes. No seeded data presented as real. No "cash" inferred from Stripe gross payments.

Company Health should be part of Scoreboard. It should not be another primary destination unless something is broken.

# Le-E should be everywhere, not a separate place to visit

Le-E should be the intelligence layer across the entire product.

Le-E should:

* Read authorized Gmail conversations
* Read Calendar events
* Understand CRM relationships
* Monitor vendors, Partners, prospects, investors, customers, and team interactions
* Detect unanswered messages
* Detect commitments you made
* Detect commitments other people made
* Identify when a conversation has gone quiet
* Prepare meeting briefs
* Prepare post-meeting follow-ups
* Suggest responses
* Draft messages
* Turn conversations into tasks and next actions
* Warn when something important is falling through the cracks
* Explain KPI changes and platform problems
* Produce a concise morning brief
* Help plan the day
* Answer questions about the company

Le-E should be available as a side panel from every workspace.

For normal internal actions, Le-E should act without repeated confirmations:

* Create a task
* Add a note
* Set a next action
* Change a due date
* Mark something waiting
* Update a relationship stage
* Record a manually sent email

Le-E should require one explicit confirmation for:

* Sending an external email
* Starting a live campaign
* Releasing a new audience
* Removing suppression
* Publishing content
* Deleting something important

Not two or three confirmations. Not repeated permission prompts for normal internal work.

# Inbox, Calendar, Support, Files, and Health are capabilities—not primary destinations

This is where we went wrong before. We treated every capability as a page.

They should be accessible, but they do not all need permanent top-level navigation.

## Inbox

Inbox intelligence belongs inside Today and Relationships. A full Inbox view can exist as a secondary filter for communications, but it should not feel like another product.

## Calendar

Today should show today's agenda. Relationship records should show related meetings. A full weekly calendar can be opened when needed.

## Support

Urgent and waiting support should appear in Today. A full support queue should exist as a secondary view.

## Files

Files should appear in the context of the related Partner, investor, campaign, support issue, or meeting. Global Search can find everything.

## Company Health

Only exceptions should appear in Today. The full diagnostic view belongs under Scoreboard or Settings.

# The navigation should be radically simpler

The primary navigation should be:

```text
Today
Relationships
Campaigns
Scoreboard
```

Global controls:

```text
Search
Create
Le-E
Settings
```

That is it.

No primary navigation for:

* Agents
* Engines
* Queue
* Artifact viewer
* Automation inbox
* Logs
* Live gates
* Operating memory
* Heartbeat
* Review states
* Internal reports
* Storage
* Provider diagnostics

Those can remain behind the scenes or in an Advanced section.

# The experience standard

Every visible button must finish a meaningful piece of work.

A button must not:

* Open a generic record with no actions
* Send you to a log
* Reveal internal state without explaining what to do
* Create another task instead of completing the current task
* Require you to remember what page to visit next
* Perform a partial action and leave the rest for you to log manually

The interface should preserve:

* Current position
* Filters
* Selected record
* Draft text
* Scroll position
* Open panel
* Queue order

It should respond immediately, use plain language, and provide one clear primary action.

# What your normal day should look like

## First 15 minutes

Open Today and understand:

* Cash
* Revenue
* Signups
* Critical system health
* Urgent customer issues
* Today's meetings
* The top three outcomes

## Next 60–90 minutes

Clear communications:

* Review Le-E's summaries
* Edit drafted responses
* Send or open in Gmail
* Record the interaction automatically
* Set the next action

## Next 30–45 minutes

Manage relationships:

* Advance active Partner and investor conversations
* Review stalled relationships
* Approve prospect outreach
* Prepare for meetings

## Next 30 minutes

Review support and customer feedback.

## Next 30 minutes

Review marketing and campaign exceptions.

Once a week, replace that block with the weekly Social planning session.

## Remaining time

Focused work that actually grows the business.

The Command Center's purpose is to protect that time—not consume it.

# The definition of a usable Command Center

It is usable when you can truthfully say:

* I know what matters within five minutes of opening it.
* I can complete work without navigating through multiple pages.
* I can clear my important follow-ups in one focused session.
* Every relationship shows the last touch, next touch, stage, and commitments.
* Le-E tells me what I am forgetting.
* Social planning takes one weekly session.
* Reactivation, Partner outreach, and press operate with clear Run/Stop controls.
* I can see cash, growth, pipeline, support, and platform health from one scoreboard.
* Internal actions do not trigger unnecessary permission prompts.
* The system records work automatically.
* I do not need to understand its internal agents, engines, records, or gates.
* I can run LegalEase in under four focused hours per day.

**That is the Command Center.**

The current foundation should remain, but the product needs to be reduced and reorganized around these four workspaces. The next effort should not add another capability. It should hide the internal machinery, collapse duplicate pages, and connect the existing functions into these end-to-end workflows.
