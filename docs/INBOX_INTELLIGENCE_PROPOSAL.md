# Inbox Intelligence — Design Proposal (awaiting Roger's approval)

Date: 2026-07-12. Status: **PROPOSAL ONLY — nothing built.**
Authorizing decision: `docs/decisions/2026-07-12-inbox-full-read-roger-legalease.md`
(full READ-ONLY access, roger@example.com only, merged to main via PR #53).

Acceptance test (Roger's words): *after three days, my morning queue shows what slipped,
what I owe, and what's waiting on others, in plain sentences.*

---

## 0. What exists today (research findings, file:line verified)

- **Scopes are already read-only and send-incapable**: `gmail.readonly` + `calendar.readonly`
  only (`google-workspace.mjs:33-44`); no send/compose/modify scope anywhere; grep-guard
  tests forbid `gmail.send` strings in source. Tokens are AES-256-GCM encrypted in the
  `socialAccounts` collection; **the connected mailbox address is already captured**
  (`profile.email` stored as `accountName` at OAuth callback, `preview-server.mjs:38646`).
- **Today's Gmail reads** are metadata+snippet only, on-demand only, and persist nothing
  raw (hashed ids, domains, classifications — enforced by `test-google-readonly-intelligence`).
  The 18I snippets-only rule stays in force for every account except the one this decision
  names.
- **Draft machinery exists**: the `emailDrafts` collection (`internalOnly:true`, capped,
  "nothing was sent" copy), `prepareSupportDraftReply` with its **UPL refusal gate**
  (`support-desk.mjs:84-89` — UPL-sensitive text gets NO draft, "reply personally"), and
  the `lawrenceSignoffAt` sign-off convention + UPL patterns already in the guidelines gate.
- **Engine + queue contracts**: a plan()-only heartbeat engine is *structurally* incapable
  of side effects (the runner skips act() when absent); external calls go through injected
  fetchers; queue items carry stable ids, `sourceRef` (deep-linked since Phase O), `dueAt`
  (already drives overdue escalation in the alerts engine), and one-tap approval via
  `needs_roger`. The approve-then-apply pattern exists twice (prospects, automation
  suggestions): engine code is locked out of writing "approved"; a human endpoint flips
  the flag; the applier acts afterwards.
- **PII helpers exist**: `redactSupportText` (emails/phones/SSN/DOB/case refs →
  `[redacted-*]`), `maskEmail`.
- **One genuine gap**: there is NO owner-only visibility primitive — `/api/state` returns
  every collection to any authenticated reader. Owner-visible-only inbox data requires a
  new (small) mechanism.

## 1. Plain-English design

### What Roger sees (the deliverable)

Every morning, Today's Overnight block and the Queue contain sentences like:

- "**You owe Dana Fulton a reply — 4 days.**" → Open lands on the signal card: who, how
  long, the quoted line that needs answering, a **Prepare draft** button, and an **Open in
  Gmail** link. Done / Snooze / Dismiss are one tap.
- "**Fulton County went quiet after your reply — 6 days.**" → same card shape, with a
  suggested nudge draft one tap away.
- "**You wrote 'I'll send the packet this week' to Marcus — that lands Friday.**" → a
  queue item with a real due date; if Friday passes, the existing alerts engine escalates
  it automatically.
- "**Inbound from a pipeline contact: Riverside Legal Aid replied.**" → a suggested
  partner-record update with the evidence line quoted; **Approve** applies it, Dismiss
  discards it. Nothing updates on its own.

Drafts: pressing **Prepare draft** creates an internal draft (skeleton from the thread
context; optional AI polish) that appears in the queue for approve/edit/dismiss. Approved
drafts are copied out by hand — the copy button is the only exit; there is no send path
to approve. If the inbound text trips the UPL patterns, **no draft is prepared**; the card
says why and flags Lawrence (`lawrenceSignoffAt` convention), matching how support replies
already behave.

### The four safety walls

1. **Capability wall** — scopes stay `gmail.readonly`; no send route exists; the engine is
   plan()-only (no act() method = the heartbeat cannot run side effects for it even if
   toggled). Pinned by source-scan tests, as today.
2. **Identity wall** — full read activates ONLY when the bound connector address equals
   `roger@example.com` (checked at fetch time, every scan; constant in code, not config,
   so changing it is an auditable diff). Any other connected account gets exactly the old
   snippets-only behavior — enforced in the same fetcher, pinned by test.
3. **Privacy wall** — bodies are fetched transiently for classification and never persisted.
   Stored records carry: classification, one plain-English summary sentence, ≤3 quoted
   evidence lines (≤240 chars each, run through `redactSupportText`, `pii_redacted:true`),
   counterpart name/address (needed to say who), thread pointer (needed for Open in Gmail),
   timestamps, confidence. A source-scan test forbids body/raw/payload fields in the
   writer. New owner-only projection: `/api/state`, `/api/boot-state`, and the artifact
   viewer strip `OWNER_ONLY_COLLECTIONS` for any actor whose role is not `owner`.
4. **Suggestion wall** — every output is a queue item or a draft. Record updates ride the
   existing automation-suggestion approve-then-apply flow (`proposedChanges` + quoted
   evidence; approval applies the patch server-side and writes the activity event).
   Engine code cannot write "approved" — same lockout the prospect pipeline uses.

### Signal definitions (what "slipped" means, precisely)

| Signal | Rule (conservative on purpose) |
|---|---|
| **You owe a reply** | Last message in thread is inbound, addressed to you, older than 2 days, sender not a bulk/no-reply pattern, you haven't replied since. Age shown in days. |
| **Went quiet on you** | Last message is YOUR outbound reply, counterpart is a pipeline contact (outreach/partner/prospect/company contacts by address or domain), no inbound for 4+ days. |
| **Commitment you made** | A from:you message matches explicit promise patterns ("I'll / I will / I can send … by/this week/tomorrow/Friday…"). Implied deadline becomes `dueAt`. Explicit phrasings only at first — fuzzy promises are a tuning pass after the 3-day test. |
| **Pipeline inbound** | Inbound whose sender matches a pipeline record → suggested record update (last-contact stamp, reply status, next action) with the evidence line quoted. |

Every signal has a stable id (thread + kind), so re-scans refresh rather than duplicate,
and your dismissals stick (the queue's decided-status rule already guarantees this).

### Cadence

Daily on the heartbeat (the engine sees the same tick the briefs use) + an on-demand
**Scan now** (`POST /api/inbox/scan`, owner/admin gated). Scan window: 14 days back,
paginated (Gmail `nextPageToken` loop — new; today's helper reads one page), capped at
500 messages/scan with the cap logged, never silently truncated.

## 2. Data model (all registered per the B1-trap checklist, with membership tests)

- **`inboxSignals`** (list): the classified records described above. Cap 500.
- **`inboxConfig`** (singleton): bound mailbox echo, lastScanAt, window, caps, quiet-list
  (bulk-sender patterns Roger can extend).
- **Drafts reuse `emailDrafts`** (already registered, already internal-only), extended
  with `signalId`, `uplSensitive`, `lawrenceSignoffAt`.
- **Record-update proposals reuse `automationSuggestions`** (existing approve-applies flow).
- New queue item types: `inbox_reply`, `inbox_commitment` (added to `QUEUE_ITEM_TYPES`).

## 3. The activation audit event (from the decision record)

The build ships with the engine's autopilot toggle **OFF**. The first time the toggle is
flipped ON with a verified `roger@example.com` binding, the engine writes:
- an `auditHistory` row — actor, action "inbox full-read decision recorded", resource
  `docs/decisions/2026-07-12-inbox-full-read-roger-legalease.md`, before/after posture;
- a `companyEvents` entry (pointer + plain summary, no PII), per the standing convention.

## 4. Build plan (each phase its own PR, clean-worktree npm test gate)

1. **I1 — Foundation.** Identity gate + paginated fetcher (injected, fail-closed when
   absent), `inboxSignals`/`inboxConfig` + registration + membership tests, plan()-only
   daily engine + on-demand scan, all four classifiers, privacy source-scan tests (no body
   persistence), owner-only projection primitive, activation audit event. Toggle default
   OFF. New verifier: `test-inbox-intelligence.mjs`.
2. **I2 — Queue + surfaces.** `queueFromInboxSignals` adapter, new queue types, deep links
   (`#item/inboxSignals/<id>` + Open-in-Gmail external link), Overnight sentence, `dueAt`
   on commitments (alerts overdue escalation comes free).
3. **I3 — Drafts.** Prepare-draft per signal → `emailDrafts` (skeleton + optional AI
   assist), UPL refusal + Lawrence flag, approve/edit/dismiss cards, clipboard-only exit.
4. **I4 — Pipeline suggestions.** Evidence-quoted `automationSuggestions` targeting
   partner/outreach records via the existing approve-applies endpoint.
5. **Acceptance.** Roger flips the toggle; after three days of scans, the morning queue is
   judged against the acceptance sentence. A short walkthrough doc ships with I2.

Guard-test updates done in lockstep (I1): `test-google-readonly-intelligence` (allow the
gated full-read path while keeping every no-send/no-raw-persist assertion),
`test-meeting-briefs` untouched (briefs stay snippets-only). The two pre-existing red
extended tests (`test-email-draft-safety`, `test-email-readiness`, stale since the
display-truth refactor — documented in followups) get their stale assertions fixed
opportunistically in I3 since that PR touches their subject.

## 5. Open questions for Roger

1. Approve the design overall (or edit)?
2. **Draft generation**: default is a free, instant skeleton (support-desk pattern) with an
   optional per-draft "AI assist" button that spends OpenAI credits. OK, or default to AI?
3. **Scan window/caps**: 14 days back, 500 messages/scan, daily + on-demand. OK?
4. **Commitment detection starts conservative** (explicit "I'll … by …" phrasings only) —
   accepts missing some fuzzy promises in exchange for near-zero false alarms; tune after
   the 3-day test. OK?
5. **Pipeline contacts** = outreach + reactivation + partner + prospect + company contacts,
   matched by address then domain. Anyone else (e.g. investors list)?
6. **Activation**: build ships OFF; you flip the inbox toggle (that flip writes the audit
   event). Confirm that's the arming step you want.
