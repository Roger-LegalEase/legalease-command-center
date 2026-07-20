# vNext compact-read and performance contract

CCX-800 governs Today, Inbox, Social, Outreach, Partners, Files, Investor Room,
Search, Create, and Discovery with the shared budgets in
`scripts/vnext-performance-contract.mjs`.

- Primary pages read `/api/ui/*` projections after boot; they do not request `/api/state` or
  `/api/boot-state`.
- List reads use bounded `limit` and opaque or validated cursors. The contract fixture includes
  hundreds of synthetic records so an accidentally unbounded response fails the 250 KB gate.
- Detail reads fail above 150 KB. A private whole-state sentinel must never appear in any result.
- Production-like local measurements warm each route, take seven samples, and enforce the 750 ms
  p95 target without provider calls. Hosted p95 remains observable deployment evidence.
- Partner, Outreach, and Files integrations reject full-state persistence; focused domain tests
  prove scoped writes and replay-safe request identifiers.
- Browser coverage counts compact reads across a route change and requires visible feedback to
  begin within 100 ms.
- Initial inline client JavaScript and linked critical CSS are measured from the rendered shell
  and bounded explicitly. The 1.65 MB JavaScript ceiling records the current strangler-shell
  compatibility cost and prevents growth; it is not represented as a final optimization target.
  Product flags remain server-owned and off unless enabled separately.

Run the focused contract with `npm run test:vnext-performance`. Run the browser request-count
contract with `npm run test:browser -- performance.spec.mjs`.
