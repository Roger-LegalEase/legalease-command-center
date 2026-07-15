# Decision: full READ-ONLY inbox access for roger@example.com (one mailbox only)

- **Date:** 2026-07-12
- **Decided by:** Roger (owner), in writing.
- **Status:** Decided. Build gated on a separate design-proposal approval.

## The decision, verbatim scope

Full inbox READ access is granted for **roger@example.com ONLY**.

- Every other connected account **stays out of scope entirely** — the snippets-only rules
  are **unchanged** for them.
- This **supersedes the 2026-07-07 (Phase 18I) snippets-only resolution for that one
  mailbox** and for that mailbox only. The 18I rule ("Gmail snippets ON DEMAND only,
  never bodies, never background") remains the standing rule for every other account.
- Gmail OAuth scopes stay **READ-ONLY**. The agent must remain **technically incapable of
  sending** — not policy-incapable, capability-incapable.

## Bounds that travel with the grant

1. Reads run on the heartbeat cadence plus on-demand.
2. No wholesale storage of email bodies: classifications, summaries, and short quoted
   evidence lines only; owner-visible only; PII redaction applies.
3. Replies are prepared as **drafts** for approve/edit/dismiss in the queue; anything
   legal-adjacent follows UPL rules and flags Lawrence where needed.
4. Everything the layer produces is a **suggestion** — nothing auto-updates records,
   auto-completes tasks, or sends. One-tap approval in the queue.

## Audit trail

- This file is the durable decision record (repo history = timestamped, attributable).
- A runtime `auditHistory` event (action: "inbox full-read decision recorded",
  resourceType: "owner_decision") is written to state when the inbox-intelligence
  capability first activates, so the in-app SOC 2 audit trail carries the decision next
  to the capability it authorizes. Until the build ships, this file is the record.

## Acceptance test for the build (Roger's words)

After three days, the morning queue shows what slipped, what Roger owes, and what is
waiting on others, in plain sentences.
