# Phase 2 acceptance: Inbox and Today workflows

Status: CCX-206 acceptance packet
Scope: browser tests and deterministic fixture composition only

## Objective and boundary

CCX-206 proves that the merged Today, Inbox projection/page/actions, and Unified Quick Capture work as one founder workflow. It adds no production endpoint, collection, migration, state machine, route, alias, action, or product surface. It does not redesign Today, Inbox, Global Create, or Quick Capture and does not begin CCX-301.

The browser packet uses the existing compact authenticated endpoints:

- `GET /api/ui/today`
- `GET /api/ui/inbox`
- `POST /api/ui/inbox/action`
- `GET /api/ui/quick-capture/capabilities`
- `POST /api/ui/quick-capture`
- existing route-access, boot, and exact-item contracts

All source transitions remain owned by the merged domain adapters. The browser submits only their reviewed compact requests.

## Workflow matrix

| Workflow ID | Founder workflow | Deterministic acceptance result |
| --- | --- | --- |
| today-now | Open Today and activate Start/Resume | The exact server-supplied Now hash opens; zero mutation request or source transition occurs. |
| today-history | Return with Back and revisit with Forward | Today and the exact object retain ordinary hash history without reload or alias drift. |
| inbox-social | Open the Social-review item and its source | One underlying Inbox row opens one exact Social Post and Back returns to the same filtered Inbox. |
| safe-approval | Approve through the Inbox adapter | One existing Approval becomes reviewed, one existing company event is added, a repeated request is already applied, and no execution occurs. |
| snooze | Snooze the eligible Company queue item | The source moves from Needs me to Waiting, appears once, and the authorized Needs me badge decreases once. |
| post-capture | Capture a Post idea from Today | Social is visible before Save; one inert Post, one audit row, and one activity row are created; Open uses the exact returned Post hash. |
| today-recovery | Fail the compact Today read once | The shell stays visible, no white screen appears, and one duplicate-safe retry recovers. |
| inbox-recovery | Fail the compact Inbox read once | The shell and safe filter state remain, one retry recovers, and no duplicate read is issued. |
| session-expiry | Expire the authenticated UI with Quick Capture open | Protected Inbox content, badge, unsaved text, and authenticated overlays are cleared. |
| restricted-work | Read and guess a hidden owner-only action as a restricted user | The title and stable source ID are undiscoverable; the guessed action returns the nondisclosing failure and writes nothing. |

## Cross-workflow assertions

The suite measures the workflows as one system rather than reimplementing their focused contracts:

- Today remains ordered `now`, `next`, `needs-you`, `progress`.
- Start/Resume and every Open are exact navigation only.
- Back and Forward preserve safe history.
- Needs me counts and the shell badge come from the same authorized Inbox projection.
- The reviewed Social decision, snoozed queue item, and captured Post each appear once.
- Literal duplicate activation creates one browser mutation request.
- Repeating the Approval request creates no second Approval or company event.
- Quick Capture creates one Post, one audit row, and one activity row.
- Today and Inbox navigation/read/retry add no full-state request after boot.
- The Quick Capture interaction must not add a full-state request after boot.
- No unapproved critical same-origin response or failed request escapes the monitored harness.
- Unexpected `console.error` and uncaught page errors remain zero.
- Axe serious and critical findings are zero for Today, Inbox, and the shared capture sheet at 1440px and 390px.
- Page-level horizontal overflow is zero at both widths.

Failure-only Axe output includes the surface, width, rule ID, impact, help text, selectors, and failure summary. Passing scans are quiet.

### Narrow defect corrected by the suite

The first integrated run found that Unified Quick Capture called the legacy broad
`load()` function after its compact POST. That produced two additional broad state
reads before Open even though the server had already returned the exact reviewed
result link. CCX-206 removes that refresh. The compact, server-vetted result is kept
in bounded page memory so the immediate exact route can show its saved title,
destination, and success state; a normal later page load reads the authoritative
record as before. No endpoint, collection, persistence rule, route, or domain
transition was added.

## Mutation and external-action boundary

The successful workflow has exactly three accepted browser mutations: one approval request, one snooze request, and one Quick Capture request. The duplicate Approval request is an explicit idempotency probe and returns `alreadyApplied` without evidence or state duplication.

Expected source effects:

| Effect | Count |
| --- | ---: |
| Approval records reviewed | 1 |
| Company queue items snoozed | 1 |
| Post ideas created | 1 |
| New-object audit rows | 1 |
| New-object activity rows | 1 |

Prohibited effects remain zero: sends, publications, Campaign launch/release/resume/enrollment, provider calls, Partner-stage changes, File-status changes, suppression changes, live-gate changes, and unrelated source writes. Approval records review only; the Social Post remains `needs_review`. Quick Capture creates an inert `idea` Post and does not approve or publish it.

## Fixture isolation and repeatability

`scripts/run-browser-tests.mjs` starts a dedicated vNext Phase 2 owner fixture and a matching authenticated restricted fixture from synthetic JSON state. Both use temporary files, loopback ephemeral ports, scrubbed credentials, blocked non-loopback networking, and every live-action gate off. The owner fixture contains paired `-001` and `-002` approval/snooze records so `--repeat-each=2` proves the same transitions twice without depending on prior test state.

The restricted fixture contains the same owner-only source record but applies the real restricted session policy. This lets the test prove nondisclosure and rejected mutation without production data or a public failure-injection switch.

Today and Inbox read failures use Playwright request interception only. There is no debug query parameter, failure endpoint, test environment branch in production code, automatic mutation retry, or provider mock that can reach a live service.

The shared browser fixture keeps only clock-sensitive classifications relative to the isolated server's runtime: the synthetic active Daily Run remains recent and pagination-only Tasks remain future-due. This prevents a calendar rollover from expiring the expected Resume state or moving enough fixture rows between Inbox groups to invalidate pagination, without adding a product clock override or changing production projection logic.

## Legacy comparison and route compatibility

The focused gate protects the established byte hashes for `htmlShell()` and `commandCenterOverviewHtml(posts)`. The browser flag-off check loads legacy Today and observes no vNext Today, Inbox, action, or Quick Capture endpoint request. The existing 75 canonical routes and 53 aliases remain intact; all acceptance links use the shared compatibility parser and exact source IDs.

## Verification and rollback

Run:

```text
SKIP_ENV_LOCAL_FILE=1 npm run test:vnext-phase2-acceptance
SKIP_ENV_LOCAL_FILE=1 npm run test:browser -- tests/browser/phase2-workflows.spec.mjs
SKIP_ENV_LOCAL_FILE=1 npm run test:browser
SKIP_ENV_LOCAL_FILE=1 npm run test:browser -- --repeat-each=2
```

Rollback removes this document, the focused test, the browser spec, the additive package script, and the two disposable fixture-server entries. No production module, endpoint, data record, migration, or source state requires rollback.

Phase 2 implementation exit criteria are satisfied when this packet and the CCX-200 through CCX-205 focused gates pass together, the full browser suite and repeat run are green, safety comparisons remain zero, and the exact extended failure set is unchanged. CCX-301 remains blocked until CCX-206 is reviewed and merged.
