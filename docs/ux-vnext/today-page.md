# Today command surface

## Objective and boundary

CCX-204 turns vNext Today into a calm command surface that answers four questions, in order: what should I do now, what are the next three things, what needs me, and what moved forward.

The page is enabled only when `COMMAND_CENTER_UX_VNEXT` is exactly `true`. The legacy `commandCenterOverviewHtml` renderer, shell, Today cards, calendar, routes, and behavior remain byte-for-byte unchanged when the flag is false, missing, or invalid. `#overview` and `#cockpit` continue through the shared compatibility map to `#today`; Today remains the first of the five primary destinations.

CCX-204 consumes the merged CCX-203 `buildTodayView(state, actor, now)` projection. It does not duplicate authorization, source collection, ranking, deduplication, current-week classification, or exact-link rules.

## Architecture and compact endpoint

The vNext-only implementation has three boundaries:

- `scripts/today-page-service.mjs` invokes `buildTodayView` exactly once, strips internal source identity and capability fields, adds safe presentation metadata, and deeply freezes the compact response.
- `scripts/ui/pages/today-page.mjs` owns the static accessible loading surface and browser controller. Dynamic source text is assigned with `textContent`; links must pass the shared route-compatibility parser without reconstruction.
- `assets/ui/today-page.css` owns the LegalEase hierarchy, responsive stacking, focus compatibility, and reduced-motion behavior.

`GET /api/ui/today` authenticates and reauthorizes every request under existing `read_internal` policy, creates the actor server-side, supplies one ISO timestamp, reads current state once, and invokes the service. Flag-off requests return 404. Unauthorized requests return founder-facing failure copy without protected data. `preview-server.mjs` contains only this compact endpoint branch, not page ranking or markup.

The response contains `ok`, `generatedAt`, `dateLabel`, `nowItem`, `nextItems`, `needsMeSummary`, `progressSummary`, and presentation-only utility booleans/links. It contains no full application state, full source record, raw `sourceKind`/`sourceId`, dedupe key, capability ID, provider payload, email body, legal record, private path, diagnostic payload, token, secret, or mutation intent. Exact record IDs remain only inside reviewed hash links. The endpoint performs no mutation, persistence, external request, provider call, send, publication, approval, completion, snooze, launch, release, suppression change, or live-gate change.

## Four-section anatomy

### Now

Now is the full-width dominant panel. It renders at most one CCX-203 `nowItem`: destination/object context, title, `whyNow`, useful nonempty summary, truthful priority, real due date, safe owner label, and one orange primary link.

The label is `Resume` only when CCX-203 explicitly reports the current exact Daily Run item. All other items use `Start`. The accessible name includes the item title. The link navigates to the model’s exact safe hash, preserves browser Back, and never starts a Daily Run, changes a Task, or invokes an action endpoint.

When Now is empty, the page says “You’re clear to plan the day” and “Nothing is currently ranked as your next action,” then offers the authorized Inbox and existing Daily Run planning routes. It does not fabricate work.

### Next

Next preserves model order and renders zero to three items, numbered 1–3. It never reranks, fills an empty slot, repeats Now, or adds Waiting/Updates. Each row presents context, title, `whyNow`, truthful metadata, and one exact hash navigation link. The empty state says “No additional priorities.”

### Needs You

Needs You consumes `needsMeSummary` as its authorized source. It shows the full Needs me count, nonzero urgent count, useful high count, up to three supplied items after Now/Next exclusion, and `#inbox?group=needs-me`. It does not change the full count when top items are excluded, copy Inbox filters/actions, or reimplement the shell badge. Its empty state says “Nothing needs you” and keeps Open Inbox available.

### Progress

Progress consumes CCX-203’s meaningful current-week `progressSummary`. It shows the plain-English period, full movement count, up to five supplied items with explanations and exact links, and `#inbox?group=updates`. The browser does not read raw activity or reclassify diagnostics, telemetry, health checks, provider syncs, migrations, or technical events.

An available empty week says “No progress recorded this week.” An unavailable source says “Progress is unavailable” and does not display zero as performance. No revenue, engagement, percentage, streak, or Partner outcome is invented.

## Exact links and navigation

Today uses the exact model links for Post, Campaign, Partner, Task, File, and Report records. The browser accepts a link only when the shared CCX-102 parser returns the identical safe hash. It does not rebuild routes and adds no second route policy. Needs You and Progress use reviewed Inbox group hashes. Route access remains subject to CCX-105 reauthorization, and Back/Forward retain ordinary hash history.

## Quick Capture boundary

CCX-205 upgrades Today's single visually subordinate entry to open the shared Unified Quick Capture sheet when the server declares capture available. The same form and compact endpoints power Global Create **Quick note**; Today renders no inline field or duplicate modal. Intent remains explicit, destination is visible before Save, and unused Quick Capture performs no write or destination request. See `quick-capture.md` for the seven-intent contract.

## Calendar and planning deferrals

The vNext page does not reproduce Today Calendar, Today Flow, Needs Follow-Up, Tasks, Campaigns, Social, Partners, Reports, Revenue, health, or system dashboards. Calendar remains read-only in the unchanged legacy renderer and existing route. Daily Run, Morning Brief, Daily Closeout, Focus, Tasks, and Operating Memory remain reachable through existing routes; information not represented by CCX-203 is deferred. No collection, migration, Today state machine, or mutation adapter is added.

## Loading, failure, and session behavior

The shell remains visible while a Today-specific four-section skeleton uses `aria-busy` and restrained live status. It shows no fake title, count, or progress and has no artificial delay. The controller waits for the legacy boot handoff before issuing its read, preventing background legacy refreshes from creating a request loop.

A failure says “Today could not load. No records were changed. Try again.” Retry resets only the Today scaffold, reauthorizes, issues one GET, suppresses concurrent activation, and preserves `#today`. Error and unauthorized states are restored if a legacy background refresh attempts to replace them, without another read. Unauthorized state clears stale content and offers Help without protected title, ID, count, or progress.

CCX-105 owns session expiration. Today clears its payload and pending version, the shell clears authenticated overlays and the Inbox badge, and “Your session ended” replaces the page. Recovery Mode also clears stale Today data.

## Authorization and privacy

Server filtering occurs before response compaction or rendering. Missing, unknown, forged, unauthenticated, or aggregate-only actors fail closed. Hidden work affects neither content nor counts. The client never treats hidden DOM as authorization and cannot derive capability names from utility booleans.

All source text uses DOM text assignment and every source hash passes the shared parser. The UI module imports no storage, server, domain engine, provider, send, publish, or business layer and performs no storage write.

## Accessibility and responsive behavior

The shell retains one semantic `main`; Today adds one `h1`, ordered section headings, list semantics, text priority labels, specific Start/Resume/Open names, visible focus through shared tokens, practical 44px mobile targets, live loading status, meaningful empty states, and reduced-motion support. Exact orange `#F04800` remains the primary background with large bold text that passes contrast.

At 1440 and 1280 pixels, Now spans the content area and Next/Needs You form a weighted row. At 1024 pixels, the supporting row stacks to prevent a cramped Needs You card. At 768 and 390 pixels, visual order is Now, Next, Needs You, Progress, then capture. Explanations and text actions remain visible with no page-level horizontal overflow. Sidebar/drawer, Search, Create, Help, Profile, Inbox, and Le-E remain usable. The redundant floating Le-E pill is hidden on Today so it cannot cover content; navigation still opens the unchanged panel.

## Performance and evidence

The focused production-like fixture enforces a response below 750 ms and substantially below 100 KB. Playwright records endpoint time and bytes, one initial Today request, duplicate reads, Today-caused full-state reads, skeleton-to-content time, unused Quick Capture/Search/Create requests, mutations, writes, and action execution. Opening Today is one compact read and no mutation request. Local measurements are PR evidence, not hosted claims.

The browser runner uses temporary synthetic JSON data, ephemeral loopback ports, blocked provider networking, scrubbed credentials, and every live-action gate off. Ten unedited screenshots live under `docs/ux-vnext/screenshots/ccx-204/` at 1440, 1280, 1024, 768, and 390 pixels, including focused and empty states.

## Legacy preservation and rollback

Focused hashes protect the complete legacy `htmlShell` and `commandCenterOverviewHtml` blocks. The 75 canonical routes and 53 aliases remain unchanged. Flag-off HTML loads no Today stylesheet, controller, or endpoint request.

Rollback removes the service, page module, stylesheet, endpoint/role wiring, focused/browser tests, this document, and vNext shell inclusions, or disables the exact server flag. No data repair, migration rollback, source transition, or cache cleanup is required.

CCX-205 is layered only into the vNext utility entry. Disabling vNext restores this documented CCX-204/legacy boundary without changing legacy Today data or markup.
