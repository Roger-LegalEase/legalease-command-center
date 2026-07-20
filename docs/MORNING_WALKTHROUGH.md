# vNext operator guide — the morning walkthrough

Purpose: prove that a founder can complete the morning operating loop without guessing what a control does. Run against an authenticated sandbox or approved hosted cohort. Every click should begin feedback within 100 ms; do not enable live sends or publishing for this walkthrough.

## Prerequisites

- Confirm `/api/version` is the intended commit and `/api/health` is healthy.
- Confirm the server-side vNext flags intended for the cohort and confirm every live-action flag is `false`.
- Sign in with the least-privileged role that can complete the walkthrough.
- Use synthetic records only outside an approved production review.

## Five-destination workflow

1. **Today:** read system truth, overnight changes, and the next actions. Open an exact object link, return to Today, create a small synthetic task with Create, and reload to prove it persisted.
2. **Social:** open the review item, inspect its exact creative reference and independent channel variants, edit the draft, save, and reload. Confirm publishing remains blocked and the UI states what was and was not published.
3. **Outreach:** open the county-intake draft, move through goal, audience, message, schedule, and review. Verify exact audience and suppression counts. Save the draft, but do not launch or send.
4. **Partners:** open Fulton County from its exact link. Confirm an immediate next action, related Outreach work, and related Files. Update the internal next action, reload, and ensure lifecycle history is preserved.
5. **Files:** search for the compliance memo, preview it, inspect access and relationship metadata, then open Investor Room readiness. A draft, failed, missing, or stale artifact must not count as current.

Also exercise Search, Create, Inbox, Investor Room, and Discovery from their shell controls. At 390 px, tables must become readable narrow-screen alternatives without horizontal loss. Use keyboard-only navigation once: visible focus, logical headings/landmarks, trapped dialog focus, Escape close, and focus return are required.

## Sign-off

| Destination | Real save + reload | Exact link | Loading/empty/error/success truthful | Pass |
|---|---:|---:|---:|---:|
| Today |  |  |  |  |
| Social |  |  |  |  |
| Outreach |  |  |  |  |
| Partners |  |  |  |  |
| Files / Investor Room |  |  |  |  |

Stop on a dead visible control, unexplained failure, authorization leak, missing focus, or any suggestion that an external action occurred when it did not.
