# Workspace — Today

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

**Today remains an ordered work queue, not a dashboard.** It answers "what needs my
attention right now" and lets Roger finish each item in place.

## Sections

1. **Now** — the single most important item, with its action available directly on the page.
2. **Next** — the next two to five items, ranked by urgency and business value.
3. **Communications** — messages and follow-ups requiring a response (inbox signals,
   campaign replies, drafted responses). The full communications queue is a secondary
   view behind this section.
4. **Meetings** — today's agenda, preparation briefs, and follow-up obligations.
5. **Needs attention** — customer escalations, automation exceptions, platform incidents,
   KPI anomalies.

## Ranking rules

Items are ordered by a single ranking, computed from existing data (no new engine):

1. Hard blockers first: platform incidents affecting customers, campaign safety trips.
2. External-commitment deadlines: commitments with `dueAt` today or overdue
   (`inboxSignals` kind `commitment`), meeting preparation for meetings starting soon.
3. Waiting-on-me communications, oldest inbound first.
4. Follow-ups due today (relationship next-touch dates).
5. Approvals requiring judgment (`queueItems` status `needs_roger`).
6. Everything else by due date, then by declared priority.

**Priority vs urgency:** priority is Roger's declared importance on the item (stable,
manually set); urgency is derived from time (due dates, meeting start, age of inbound).
Ranking multiplies them; urgency changes hour to hour, priority only when Roger changes
it. The UI shows both separately so a high-priority non-urgent item is visibly different
from a low-priority urgent one.

## What qualifies for Today

An item appears in Today only when it requires Roger's attention **today**: due or
overdue, waiting on him, starting today (meetings), or an exception state. Everything
else stays in its workspace. Chronic clutter is a ranking bug, not a fact of life.

## The universal action panel

Every item — email, follow-up, task, approval, support issue, exception — opens the
**same** action panel (consolidating the existing task workbench drawer, per the reuse
ledger). From the panel: read a concise summary; see relationship history; draft a
response (Le-E-assisted); copy or open in Gmail; mark sent; complete the related task;
set the next follow-up; snooze; mark waiting; mark blocked; add a note; open the full
relationship only when necessary. The "Advanced full record" link is the artifact viewer,
secondary only.

## How completed items disappear

Completing the business outcome (per `workflows/01-clear-a-follow-up.md`) transitions the
underlying `queueItems` record to `completed` (a terminal status — terminal items drop
out of open work by the existing `QUEUE_TERMINAL_STATUSES` rule) and records the
interaction. The item leaves Today immediately; nothing requires a second cleanup step.

## How waiting and blocked resurface

- **Waiting** items leave the active queue and resurface when the other party responds
  (an inbound signal linked to the same relationship) or when their follow-up date
  arrives — whichever comes first.
- **Blocked** items resurface when their named blocker resolves or on their review date.
- **Snoozed** items resurface at `snoozedUntil` (the existing `wakeSnoozedQueueItems`
  behavior).

Nothing waits silently forever: any waiting/blocked item with no movement for 14 days
resurfaces in Needs attention.

## How automation exceptions are represented

Automation never surfaces internals in Today. An exception appears as a plain-language
item: what stopped, why, and the one action available ("Reactivation stopped for safety:
bounce rate crossed the threshold. Review and resume from Campaigns."). Source data:
threshold trips, heartbeat failures, webhook health, blocked publishes. Healthy
automation is invisible here.

## Mobile

Mobile shows the same ordered queue, reduced: Now, Next, and Needs attention, with the
action panel's primary action (draft/send/complete/snooze). Ranking, filters, and state
are identical to desktop — never a separate product.
