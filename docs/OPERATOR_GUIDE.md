# LegalEase Command Center — Operator Guide

_Written 2026-07-29 against production commit `aa32560`. The in-product Help page
(`#operator-manual`) is the short version; this is the full one._

This guide is organised the way the product is: four workspaces, a set of global utilities, and
a safety model that sits underneath all of it. If you read only one section, read
[The safety model](#6-the-safety-model) — it is the part that decides what any button can
actually do.

---

## Contents

1. [What this is, and what it is not](#1-what-this-is-and-what-it-is-not)
2. [Getting in](#2-getting-in)
3. [The shape of the product](#3-the-shape-of-the-product)
4. [The four workspaces](#4-the-four-workspaces)
5. [Getting data in: the importers](#5-getting-data-in-the-importers)
6. [The safety model](#6-the-safety-model)
7. [Automation: what runs on its own](#7-automation-what-runs-on-its-own)
8. [Le-E and Inbox intelligence](#8-le-e-and-inbox-intelligence)
9. [Files, proof and SOC 2](#9-files-proof-and-soc-2)
10. [Settings and Advanced](#10-settings-and-advanced)
11. [A working rhythm](#11-a-working-rhythm)
12. [When something looks wrong](#12-when-something-looks-wrong)
13. [Flags and environment](#13-flags-and-environment)
14. [Honest gaps](#14-honest-gaps)
15. [Glossary](#15-glossary)

---

## 1. What this is, and what it is not

The Command Center is the founder's workspace for running LegalEase: plan today, publish social
content, run outreach, manage relationships, and organise company files. It is **not** the
Partner Journey app and not the consumer product.

Three design rules explain most of its behaviour, and they are worth internalising before you
click anything:

- **Review-only until approved.** Almost everything the system produces — a draft, a prospect, a
  press contact, a suggestion — arrives in a state that cannot reach anyone. Approval is a
  separate, deliberate act by a person.
- **Never a fake number.** A source that is not connected reads *Unavailable*, never `0`. A lane
  that does not exist reads *Not built*, never a zero. If a screen shows you a number, something
  real produced it.
- **The machinery is not the product.** Engine IDs, heartbeat ticks, autopilot toggles and claim
  ledgers all exist and all enforce, but they live behind Settings → Advanced. The workspaces
  speak in plain language; [the glossary](#15-glossary) maps the two vocabularies.

---

## 2. Getting in

**Hosted:** `https://legalease-command-center-prod.onrender.com`. Sign in with your credential;
the server issues an HttpOnly session cookie plus a CSRF token. Static bearer tokens no longer
work — that path was deliberately closed.

**Locally:** `npm run dev` (or `npm run local:start` to run it managed in the background). With
`STORAGE_BACKEND=json` and no production credentials it runs against a local JSON file, which is
the right way to explore without touching anything real.

**Roles.** Four, in decreasing authority:

| Role | Can |
|---|---|
| **Owner** | Everything, including live-send switches, role assignment and `/api/state` |
| **Admin** | Everything operational: approvals, imports, configuration, activation reviews |
| **Operator** | Day-to-day work: tasks, captures, review states, approvals |
| **Viewer** | Aggregate reports only — cannot read the full state |

Some actions are owner-gated *inside* the handler as well as at the role layer — importing a
workbook, arming a live campaign, changing roles. Being an admin is not always enough, by design.

---

## 3. The shape of the product

**Primary navigation is four workspaces:** Today · Relationships · Campaigns · Scoreboard.

Everything else is still reachable, just not primary: Inbox from Today, Social inside Campaigns,
Support, Calendar and Company Health inside the workspace that needs them, and the machinery
pages under Settings → Advanced. Around 75 routes resolve, with 53 aliases kept alive so old
bookmarks never break.

**Global utilities**, present on every screen:

- **Search** — finds tasks, captures, rituals, notes, closeouts, partner-programme items,
  reports, proof notes, Data Room items, activity history and status snapshots. It can perform
  safe internal actions (open a route, mark a capture reviewed, route a capture). It deliberately
  cannot send, publish, or activate anything.
- **Create** — five working options: social post, outreach campaign, partner, file or folder,
  quick note.
- **Le-E** — the assistant, floating and available everywhere. Propose-only (see §8).
- **Settings**, **Help**, **Profile**, and an **Inbox** badge that counts items needing you.

---

## 4. The four workspaces

### 4.1 Today — an ordered work queue, not a dashboard

Today answers one question: *what needs my attention right now*, and lets you finish each item
without leaving the page.

Five sections, in order: **Now** (the single most important item, with its action on the page) ·
**Next** (the following two to five) · **Communications** (messages and follow-ups awaiting a
response) · **Meetings** (today's agenda, prep briefs, follow-up obligations) · **Needs
attention** (escalations, automation exceptions, incidents, KPI anomalies).

Ranking is computed, not manual: hard blockers first (incidents, campaign safety trips), then
external commitments due or overdue, then waiting-on-me communications oldest first, then
follow-ups due today, then approvals needing judgement, then everything else. Priority (what you
declared matters) and urgency (what the clock says) are shown separately, so a high-priority item
that is not urgent looks different from an urgent trivial one.

**The action panel.** Every item — email, follow-up, task, approval, support issue, exception —
opens the *same* panel: summary, relationship history, draft a response, copy or open in Gmail,
mark sent, complete the task, set the next follow-up, snooze, mark waiting, mark blocked, add a
note. "Advanced full record" is the artifact viewer and is deliberately secondary.

**How things leave.** Completing the business outcome removes the item immediately — there is no
second cleanup step. Waiting items return on their follow-up date, or when an inbound signal from
the authorised mailbox is linked to the same relationship — and that second trigger only works
while inbox intelligence is on, because no campaign reply is ever recorded
([Honest gaps](#14-honest-gaps)). Blocked items return when the blocker resolves. Anything waiting or blocked with no
movement for 14 days resurfaces in Needs attention, so nothing waits silently forever.

Automation exceptions appear here in plain language with exactly one available action — e.g.
*"Reactivation stopped for safety: bounce rate crossed the threshold. Review and resume from
Campaigns."* Healthy automation is invisible.

### 4.2 Relationships — one CRM, not five contact lists

Relationships is a projection over the seven identity stores the system already had (outreach,
reactivation, prospects, partners, lifecycle, press, contacts). It creates no new store and never
silently merges anything.

- **People and organisations are two linked record kinds.** A person is keyed on normalised
  email, an organisation on domain-or-name.
- **One person, many roles.** Partner contact, prospect, investor, funder, vendor, attorney,
  media, support, consumer — a set on one record. An investor who is also a referral source and a
  partner contact is one record with three roles, never three records.
- **Ambiguous matches surface for confirmation** rather than merging. This is a rule, not a
  nicety: the clinic-directory import refused three organisation matches on exactly this basis.

Each relationship shows pipeline stage, strategic priority and relationship strength (both
founder-set, never inferred), last inbound and last outbound contact, **who owes the next move**,
open commitments, next follow-up, automation state, and eligibility/suppression state. One merged
timeline covers emails, meetings, notes, tasks, commitments, campaign activity, files, support
issues and stage changes. **It does not cover replies** — nothing in the system records one; see
[Honest gaps](#14-honest-gaps).

Saved filters include: follow-up due · overdue · waiting on me · waiting on them · no contact in
14/30/60 days · replied · meeting booked · proposal active · stalled · in automated outreach ·
suppressed · and by role. **The "replied" filter always returns nothing**, because no reply is
ever recorded — it filters a collection that is only ever read.

Suppression is always visible and always wins. A suppressed contact shows why, and every drafting
affordance respects it.

### 4.3 Campaigns — four lanes, one lifecycle

Every lane follows the same five steps, in the same words: **Plan → Review → Run → Monitor →
Stop**. Stop is always available and always immediate.

Before using this workspace, understand that four different decisions are kept physically
separate and must never be collapsed:

1. **Approve content** — this copy may exist and be used.
2. **Release audience** — these people may be contacted.
3. **Run campaign** — the machine may work through the released audience.
4. **Send message** — this one message goes out now.

Approving copy does not make anyone contactable. Releasing an audience does not start anything.
Running a campaign still requires every underlying gate to agree before a single message leaves.

#### Social lane

Weekly planning: objective → themes → inputs → concepts → per-platform copy → approve → copy or
export for **manual** posting → record the published URL → results later.

**Manual posting is the product.** The live-publishing pipeline exists but stays dormant behind
per-platform gates that are all off. Approval passes a content-guidelines gate and a render-QA
gate; an image that fails QA cannot be approved. The Review Desk is where drafts wait — approving
there does not publish.

#### Reactivation lane

A real control surface over the existing consumer re-engagement engine. It reports: running or
stopped, current audience, released waves, contacts due now, the next send window, sent /
delivered / clicks / bounces / complaints / unsubscribes (all from delivery feedback), suppressed
count, safety threshold status, last successful check, last provider response — and, when sending is blocked,
**the exact reason** (stopped by you, threshold tripped, outside the sending window, no claim
path).

Controls: Run · Stop · Resume · Review suppressed · Preview next sends · Release next approved
wave. A "review replies" view exists but is permanently empty — see
[Honest gaps](#14-honest-gaps).

#### Partner outreach lane

This is where the ranked prospect list lives, and it is currently the busiest lane.

The card states two numbers you can open: how many organisations are on the ranked list, and how
many need your approval. **Review approvals** opens the workbench:

1. **Filter.** Segment · Source · **Address kind** · **Email type** · **Tier** · Min score ·
   free-text search across name, city, state, programme and organisation type.
2. **Read the mix.** The header states it plainly — e.g. *"235 with an address (76 to a named
   person, 159 to an inbox), 14 with none."*
3. **Select.** Per-row checkboxes, or "select all shown". Each row shows score, tier, segment,
   source, location, organisation type, programme, clinic verification, and a badge for the
   address kind — a named contact, an inbox, or *no email yet* with the reason it has none.
   Warning badges flag an address shared with another organisation and a name collision.
4. **Decide.** One confirmation names the exact counts and what approval does *not* do. Only the
   ids you actually reviewed travel to the server; a filter is never approved.

**Why Email type matters.** A named staff address and a general `info@` inbox are different
permissions, and the filter exists so you can approve them separately. The address kinds are:
named person · programme inbox · organisation inbox · media inbox · partnership inbox ·
administrative inbox · none.

Approval does not make anyone contactable. It marks organisations as approved; promotion into
outreach happens later under its own toggle, contacts arrive not-enrolled, and every send gate
still applies.

**A separate approval has no interface at all.** Drafted partner emails queued for approval go
through `POST /api/outreach/approve`, which is server-authorised and working — but **no client
anywhere calls it**. Those drafts cannot be approved from any screen in the product. The
Campaigns lane reports them in words rather than folding them into a count that promises a review
you cannot perform.

#### Press outreach lane

Shares the campaign infrastructure but keeps its audience and facts separate: journalists and
publications, beats, prior coverage, an approved-facts-and-claims source (the press kit), story
angles, individualised pitches, coverage tracking. Coverage and replies are recorded by hand —
a journalist's reply arrives in Roger's mailbox and nowhere else. Contacts are imported held and un-enrolled.

_As of 2026-07-29: 545 journalists imported, 107 contactable and all approval-gated, Run stopped;
eight angle campaigns composed and inert._

#### Monitor and exceptions

Healthy campaigns are quiet. Exceptions surface in the lane's Monitor view **and** in Today's
Needs attention, in plain language, with the one action available.

### 4.4 Scoreboard — six sections, four honest statuses

Financial · Acquisition · Pipeline · Customer · Marketing · Platform health.

Every metric carries the same nine fields: definition (one plain sentence), source, freshness,
current value, previous value, target, variance, corrective action (a link that acts on it), and
exactly one status: **Live** (a connected source), **Manual** (you entered it), **Unavailable**
(not configured), or **Needs attention** (an anomaly).

Two honesty rules are enforced rather than encouraged:

- **No fake zeroes.** Unconfigured reads Unavailable.
- **No substituting one financial concept for another.** Stripe gross payments are not "cash".
  Revenue collected, refunds, burn, runway and cash available are distinct metrics with distinct
  sources; a metric whose true source is missing is Unavailable or Manual, never approximated by
  a neighbouring number.

Cash and runway are Manual inputs until a bank source exists. Derived metrics say what they are
derived from.

---

## 5. Getting data in: the importers

All of these follow the same shape: **preview writes nothing and returns the full report; confirm
is owner/admin gated and writes records only.** Read the preview before confirming — it is the
control, not a formality.

| Importer | What it takes | Where it lands |
|---|---|---|
| **Clinic directory** | The national expungement / record-clearance workbook | Prospect candidates at pending review, plus a person-level named-contacts layer |
| **Press workbook** | The media-targets workbook | Press contacts, all held and un-enrolled |
| **Consumer list upload** | A consumer CSV/workbook | Reactivation contacts, import-only and inert |
| **Expungement.ai lifecycle sync** | A lifecycle export | Lifecycle contacts and events; campaign-eligible rows are always held |
| **Prospect discovery** | IRS Business Master File, LSC grantee roster | Prospect candidates at pending review, never with an address |

Two things worth knowing about how imports behave:

- **Header rows are detected, not assumed.** Real workbooks open with a title and a description
  before the column names, and the offset differs between files. The importer finds the first row
  that reads like column names *and* carries the columns it depends on, and fails loudly naming
  the sheet and the missing column rather than reading the phone number into the email field.
- **Records with no address still import.** They arrive visibly not contactable, carrying the
  source's own reason ("No public email found"), instead of being dropped. You cannot act on what
  you cannot see.

_As of 2026-07-29 the ranked list holds 499 organisations, all pending review: 313 from the
public datasets and 186 from the clinic directory, with 63 of the original rows enriched in place.
235 carry an address; 14 are visibly uncontactable._

---

## 6. The safety model

This is the part that matters. Every protection below is enforced in code, not by convention.

| Protection | What it means for you |
|---|---|
| **Authorisation on every request** | Server-side, with a timing-safe owner comparison. Nothing is protected by the UI hiding a button. |
| **CSRF protection** | Matching origin plus a valid token, or the request is refused. |
| **Suppression checks** | Eight reasons, checked at queue time *and* again at send time — and re-checked at import, assignment, release and send in the reactivation lane. |
| **Reply stops the sequence** | A reply is a suppression reason, and the check is real — but **nothing ever detects a reply**, so it only fires if a human suppresses the contact by hand. See [Honest gaps](#14-honest-gaps). |
| **CAN-SPAM validation** | Message assembly throws without a postal address and a from-identity; compliance validation hard-fails on a missing unsubscribe, one-click header, or postal address in the body. |
| **Sending windows** | Eastern business hours, no weekends. |
| **Volume caps** | Daily, per-domain and per-classification, plus a per-wave daily cap. |
| **Durable send claims** | A claim is written atomically *before* any live send. No claim, no send — it fails closed. The ledger is append-only. |
| **Threshold auto-pause** | Hard bounce, spam and unsubscribe thresholds pause the campaign before sending, not after. |
| **Provider signature verification** | The delivery-feedback webhook verifies signatures and fails closed. |
| **No secret exposure** | Tests assert that no secret value *or variable name* reaches a browser payload or outbound HTML. |
| **Content gates** | Guidelines and render-QA gates throw on approve and schedule; a failed image cannot be approved. |
| **Gated deployment** | Seven green CI checks on main; production deploys only after CI passes; a post-deploy verification job checks the deployed commit against live production and opens an automatic revert if it disagrees. |

**Confirmation policy.** Internal, reversible actions never prompt: completing a task, adding a
note, setting a follow-up, changing priority, marking waiting or blocked, saving a draft,
updating a stage, recording a manually sent email. Exactly one confirmation — never two, never
zero — for: sending an external email, starting a live campaign, releasing an audience, removing
suppression, publishing content, deleting important information.

**Two protections have no way out.** Both are enforced, both are visible, and neither has a
workflow:

- **Suppression cannot be lifted.** There is no route and no control that removes a contact from
  the not-eligible-to-contact list. Once a contact is suppressed — for any of the eight reasons —
  that is permanent until someone builds the action.
- **A flagged duplicate cannot be resolved.** Possible duplicates and ambiguous name matches are
  surfaced for a human decision, but there is no way to confirm, merge or dismiss one. The badge
  stays on the record indefinitely.

Neither is a safety hole — both fail in the protective direction — but do not plan work that
depends on undoing either.

**When a send is blocked, the reason is specific.** "Stopped by you", "threshold tripped",
"outside the sending window", "no claim path" are different conditions with different responses.
The lane tells you which one.

---

## 7. Automation: what runs on its own

A scheduled heartbeat runs the engines. Each engine has two halves: `plan()`, which observes and
proposes and is always safe, and `act()`, which changes things. **`act()` runs only when that
engine's autopilot toggle is on, and every toggle defaults to off.** Several engines have no
`act()` at all — codebase health, engagement growth, operating loops, inbox intelligence and the
company-memory projector can only ever observe and report.

The registered engines: autonomy cycle · daily sources · publishing run · outreach · prospect
discovery · codebase health · engagement growth · the operating loops · reactivation ·
reconciliation · alerts · meeting briefs · inbox intelligence · company memory.

Discovery is additionally gated by its own flag: with it off, the loaders return zero rows and
perform no network or disk I/O at all. Discovery loaders never attach an email or a guessed
website to an organisation — contact-finding is a deliberate manual step afterwards.

The Automation Control Center is structurally read-only.

---

## 8. Le-E and Inbox intelligence

**Le-E** summarises saved work, answers operating questions, drafts internal notes, proposes safe
changes, and points you at the next review surface. It is **propose-only**: proposals execute
through the existing approval path. It cannot send email, publish, activate a dashboard, change a
publishing gate, expose a secret, give legal advice, or promise eligibility.

**Inbox intelligence** reads one authorised mailbox, read-only, and only while its toggle is on.
The first time you turn it on it writes an audit record, once. It produces signals — commitments,
things waiting on you, threads that moved — and it can draft. **It has no send route.** Drafts
never send. Anything touching unauthorised practice of law routes to the attorney rather than
being answered.

---

## 9. Files, proof and SOC 2

> **Not working in production right now.** `COMMAND_CENTER_FILES_CURSOR_SECRET` is unset on
> Render, and the Files API fails closed on a secret shorter than 16 characters: every request
> returns `503 Files are temporarily unavailable.` Files, the evidence room, assets and reports
> therefore have **no content** on the hosted app — not an empty state, an unavailable one.
> Setting that variable on Render to a value of at least 16 characters restores all of them; no
> code change is needed.

Proof gathers notes, reports, activity-backed proof, Data Room artifacts, partner-programme
artifacts and SOC 2 readiness evidence. "Generate proof summary" creates an internal review-only
summary — it does not send, publish, expose secrets, or contact anything external.

Language discipline is enforced here: use *SOC 2 readiness*, *readiness evidence*, *readiness
artifact*. Never claim certification or compliance status. A draft, failed, missing or stale
artifact does not count as current.

The press kit is the approved source of proof points and claims for the Press lane — pitches draw
from it rather than inventing numbers.

---

## 10. Settings and Advanced

- **App Status** — connections, workflow health, freshness, access protection, proof status,
  self-check status, trust warnings. A health warning means: trust only the verified parts until
  it is resolved.
- **Self-Check** — the manual post-deploy checklist. If a step fails, record it and do not assume
  the hosted app is ready.
- **Data Integrity** — documents the major collections, their stable keys and repeat-safe rules;
  checks for missing fields, duplicate keys, invalid states and secret-like fields. Exports
  produce redacted snapshots; restore is dry-run only. There is no destructive restore.
- **Team Roles** — owner-only.
- **Autonomy** — agent autonomy levels and pending decisions. Approval remains separate from
  execution.
- **Audit logs, access reviews, change management, vendor inventory, incident register** — the
  compliance registers.

---

## 11. A working rhythm

**Each morning.** Open Today. Work Now, then Next, top to bottom, finishing each item in its
action panel. Read Needs attention before you start anything new — an automation exception at the
top of the day is cheaper than one found at 5pm. Check the Inbox badge.

**Through the day.** Capture into the Inbox rather than into your memory. Use Create for anything
new. Let Relationships tell you who owes the next move rather than deciding from feel.

**Before you act on a campaign.** Read the lane card, not the engine. If the number surprises
you, open it — the card count and the list behind it are asserted to agree, so a mismatch is a
bug worth reporting.

**Weekly.** Plan social in one session. Work the prospect approvals in filtered batches — by tier
and address kind, not all at once. Read the Scoreboard and treat every *Unavailable* as a
question rather than a failure.

**After any deploy.** Check `/api/version` shows the commit you expect, then run Self-Check.

---

## 12. When something looks wrong

**Where truth lives.** `/api/version` for what is actually deployed and whether the database is
connected. App Status for connections and freshness. The lane's Monitor view for campaign
reality. Data Integrity for storage.

Common situations and what they mean:

- **A card shows a number you cannot open.** That is a bug; the product's rule is that a number
  you can see is a number you can open.
- **A lane says *Not built*.** It means exactly that, and is preferable to a zero.
- **A metric says *Unavailable*.** The source is not connected. It is not zero.
- **A campaign stopped by itself.** A safety threshold tripped. The lane names which one; resume
  from the lane after reviewing.
- **A send was refused.** Read the reason — the four causes have different fixes.
- **Something looks stale after a deploy.** Confirm `/api/version`; a deployed commit and the
  code you are reading are not automatically the same thing.

---

## 13. Flags and environment

Everything that can reach the outside world is behind a flag, and every one of them defaults to
off.

| Flag | Controls |
|---|---|
| `COMMAND_CENTER_UX_VNEXT` | The modern shell |
| `FOUNDER_OS_SHELL` | Four-workspace primary navigation; off restores the previous navigation exactly |
| `FOUNDER_OS_TODAY` / `_RELATIONSHIPS` / `_CAMPAIGNS` / `_SCOREBOARD` | The four workspaces, independently |
| `REACTIVATION_LIVE_SEND` | Consumer re-engagement live sending |
| `OUTREACH_LIVE_SEND` | Partner outreach live sending |
| `PROSPECT_LIVE_DISCOVERY` | Live discovery; off means zero rows and no I/O |
| `ENABLE_LIVE_*_POSTING` | Per-platform social posting, all off |
| `AUTOPILOT_<ENGINE_ID>` | Per-engine `act()` authority |
| `STORAGE_BACKEND` | `json` locally, `supabase` in production |
| `COMMAND_CENTER_OWNER_TOKEN` / `_CRON_TOKEN` | Owner sessions; a least-privilege token that may *only* trigger the heartbeat |

Turning a flag off is a real rollback path, not a theoretical one: the flag-off output is
byte-pinned by a guard so a flagged change cannot leak into it.

**The client-JavaScript budget is effectively full.** Initial client JavaScript measures
**1,649,933 bytes against a 1,650,000 ceiling — 67 bytes of headroom.** Any new surface must
reclaim bytes before it adds them; in practice that means shipping it as a lazily-loaded runtime
file with a small inline loader, which is how the prospect workbench and the campaigns surface
are already delivered. The ceiling is enforced by the performance contract and is not to be
raised to make room.

---

## 14. Honest gaps

Stated plainly, because the product's own rule is to prefer an honest gap to a comfortable
number:

### Nothing records a reply — the largest gap

**No reply is ever detected, stored, or counted.** There is no inbound webhook and no mailbox
poll. `outreachReplies`, `campaignReplies` and `reactivationReplies` are empty in production and
only ever read; the only code that touches them updates a reply that would have to already exist.

The consequences are worth stating without softening:

- **A campaign will report "no replies" whether or not anyone replied.** A zero here is not a
  measurement. It is the absence of one.
- The Relationships "replied" filter returns nothing, always.
- "Last inbound contact" and "who owes the next move" cannot see an emailed answer.
- Reply-stop is enforced as a suppression reason, but nothing feeds it, so **a sequence does not
  stop by itself when someone answers.**
- Reply counts, reply rates and meetings-booked-from-replies on the Scoreboard are structurally
  zero.

**Roger must check the mailbox himself.** A journalist's reply, a partner's answer, a
consumer's response — all of them exist only in the mailbox. Inbox intelligence can surface
signals from that mailbox when its toggle is on, but it does not write reply records and does not
close this gap.

### Everything else

- **Files, evidence room, assets and reports return 503 in production**, because
  `COMMAND_CENTER_FILES_CURSOR_SECRET` is unset on Render (see §9).
- **Suppression cannot be lifted and a flagged duplicate cannot be resolved** — no route, no
  control, for either (see §6).
- **Drafted partner emails cannot be approved from any interface**: `POST /api/outreach/approve`
  has no client caller (see §4.3).
- **Social autopilot is deferred**, pending platform app approval. Manual posting is the product
  today.
- **Press campaign execution is not built.** Angles are composed and inert; running one needs
  sequence mapping and enrolment.
- **The support engine and safety-telemetry monitor are planned, not built.**
- **Attribution and the funnel read honest-zero** until real product events arrive.
- **Cash and runway are Manual** until a bank source exists.
- **Some upload types are stubs.** The consumer list is wired; others are not.
- **Several legacy pages are mid-migration.** They still resolve and still work; they are simply
  not primary any more.

---

## 15. Glossary

The left column is what the code calls it; the right is what the product says. The rename changes
language only — every mechanism on the left is still the enforcement layer.

| Internal | Founder language |
|---|---|
| heartbeat cron | Next automatic check |
| live mode | Run / Stop |
| autopilot | Campaign running |
| released wave | Audience approved and active |
| threshold trip | Campaign stopped for safety |
| claim ledger | Duplicate-send protection |
| suppression | Not eligible to contact |
| webhook health | Delivery feedback connected |
| RCAP | Record Clearing Access Program — the partner programme |
| review_state / pending_review | Waiting for your approval |
| promotion | Moving an approved organisation into outreach |
| projection | The one CRM view assembled from the source lanes |

---

_Point-in-time statements in this guide are dated. Live posture changes; re-verify through
`/api/version`, App Status, and the lane cards rather than trusting a document._
