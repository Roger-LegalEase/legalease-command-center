# Workspace — Scoreboard

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

Six sections — Financial, Acquisition, Pipeline, Customer, Marketing, Platform health —
built on the existing Founder Scoreboard service (21-collection targeted read set,
`SCOREBOARD_STATUSES`) and the Company Health service, per the reuse ledger.

## The per-metric contract

Every metric on the Scoreboard shows **all** of:

| Field | Meaning |
|---|---|
| Definition | What this number is, in one plain sentence |
| Source | The system it comes from (Stripe, signups endpoint, SendGrid, manual input, …) |
| Freshness | Last-updated timestamp |
| Current value | This period |
| Previous value | Prior period |
| Target | The goal, when one is set |
| Variance | Current vs target / prior |
| Corrective action | The one link to act on it (e.g. low replies → Campaigns Monitor; overdue follow-ups → Relationships Follow-up due) |
| Status label | Exactly one of **Live**, **Manual**, **Unavailable**, **Needs attention** |

The four status labels map onto the existing `SCOREBOARD_STATUSES` /
`DATA_STATUSES` machinery — connected sources are Live, owner-entered inputs (cash,
runway via `POST /api/ui/scoreboard/finance` → `runwayInputs`) are Manual, unconfigured
sources are Unavailable, anomalies are Needs attention.

## Honesty rules

- **No fake zeroes.** A source that is not connected shows Unavailable — never `0`,
  which reads as "we measured and found nothing."
- **No substitution of one financial concept for another.** Stripe gross payments are
  not "cash". Revenue collected, refunds, burn, runway, and cash available are distinct
  metrics with distinct sources; a metric whose true source is absent is Unavailable or
  Manual, never approximated by a neighbor.
- No seeded or demo data presented as real (the ground-truth reset rule stands).
- Derived metrics say what they are derived from.

## Sections and existing sources

- **Financial** — cash available (Manual until a bank source exists), revenue collected
  (Stripe snapshot), refunds, burn and runway (`runwayInputs`), payables, weighted
  pipeline.
- **Acquisition** — visits/qualified visits (analytics when connected), signups (live
  signups endpoint), intake starts/completions, purchases, activation, conversion rates,
  attribution (`funnelSnapshots` — honest-zero until real product events).
- **Pipeline** — active Partner opportunities, new prospects, follow-ups due, replies,
  meetings booked, proposals active, stalled, weighted value (partners + prospects +
  outreach collections).
- **Customer** — new/waiting/urgent support issues, median response, resolved this week,
  refund requests, recurring categories (`supportIssues`).
- **Marketing** — social drafts ready, posts published, content-attributed traffic,
  reactivation sends and conversions, partner outreach replies, press pitches/replies/
  placements (press shows Unavailable until the lane exists).
- **Platform health** — application, database, authentication, Gmail/Calendar, SendGrid,
  Stripe, analytics, background jobs, backups — the Company Health read set
  (`connectorStatus`, `osHealthSnapshots`, `sendgridWebhookHealth`, `heartbeatRuns`,
  `systemHealth`), moved into Scoreboard. Only exceptions escalate to Today.
