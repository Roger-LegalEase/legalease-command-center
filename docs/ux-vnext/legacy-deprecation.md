# vNext legacy deprecation decision

CCX-804 removed no legacy source in this release. The measured source-size reduction from actual
removals is therefore **0 bytes**. This is intentional: the global vNext flag still uses the
legacy runtime as its tested rollback checkpoint, aliases must remain for one additional release,
and a complete production route-telemetry window is not yet available.

| Candidate | Normal vNext behavior | Decision and blocker |
|---|---|---|
| Old primary navigation and landing pages | Only Today, Social, Outreach, Partners, and Files are visible | Retain for flag-off rollback and route telemetry |
| Duplicate Social review/calendar | Old links map to Social | Retain for rollback and one more alias release |
| Duplicate Campaign surfaces | Outreach owns the visible workflow | Retain until every legacy subworkflow has parity/telemetry evidence |
| Separate Partner artifact pages | Artifacts live inside Partner records | Retain for rollback and preserved artifact links |
| Reports, Proof, and Data Room | Files and Investor Room own the visible workflow | Retain aliases and flag-off renderers for one more release |

The removal gate must be rerun after one production release. A future packet may delete an item
only when parity, browser alias coverage, zero required dependency, production verification, and
the rollback checkpoint all pass together. The checkpoint remains
`c6089bb571aa2a3e9b31a1c8aed8706e10e05586`; all sending and publishing gates stay off during
rollback.

Run `npm run test:vnext-legacy-deprecation` and the focused browser route-compatibility suite.
