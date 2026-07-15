# Command Center vNext desktop shell

## Architecture and feature flag

CCX-100 adds the production desktop application shell behind the strict server-only
`COMMAND_CENTER_UX_VNEXT` deployment flag. Missing, `false`, or invalid values return
the legacy application byte for byte. The exact value `true` selects the vNext shell.
No query, hash, cookie, request value, web storage, or browser JavaScript can change
that selection.

The server still builds the application once through `htmlShell()`. The vNext branch
passes that complete output through the pure compositor in
`scripts/ui/app-shell.mjs`, which replaces only the legacy top navigation with the
new shell chrome. It preserves the same `main#app`, serialized state, route dispatcher,
client actions, endpoint calls, safe boot, and Le-E implementation. The pure registry
and destination resolver live in `scripts/ui/app-shell-navigation.mjs`; they affect
shell selection state only and never redirect or authorize a route.

The shell consumes `assets/ui/tokens.css` and the focused layout stylesheet at
`assets/ui/desktop-shell.css`. It uses the approved logo directly from
`assets/brand/logos/legalease-logo-white-2025.png` at the source 1920:1080 aspect
ratio.

## Sidebar and active destination

The persistent desktop sidebar exposes exactly five primary destinations in this
order: Today, Social, Outreach, Partners, and Files. A separate utility region exposes
Inbox, Le-E, and Settings. Selected state has `aria-current="page"`, visible text and
indicator changes, a teal border, and a soft teal surface; it is never color-only and
does not use orange.

The resolver reads the canonical route and alias inventory from
`scripts/ui/navigation.mjs`. Every one of the 75 canonical routes and 53 aliases has a
deterministic shell destination. Parameterized `#item/<collection>/<id>` references
use an explicit collection map, preserve the exact collection and record ID, and
select the owning destination. Unknown routes retain the legacy safe fallback to
Today. Static legal pages, OAuth callbacks, social-calendar import, and unauthenticated
responses continue to run outside or before shell composition as they did previously.

This selection layer does not rewrite route behavior. Legacy hashes remain valid and
may render their current page while the corresponding founder-language destination is
selected.

## Top application bar

The white top bar provides four working controls:

- Search opens the existing `#operator-search` capability. It is a destination link,
  not a dead input and not a claim of new cross-object search.
- Create opens an accessible menu. Its current working options are Social post
  (`#content-bank`) and Task (`#tasks`). Quick capture, Campaign, Partner, and File or
  document creation are deferred because the current routed application does not
  expose a safe equivalent creation flow.
- Help opens the existing Guide at `#operator-manual`.
- Profile opens an accessible menu with the existing Settings destination and Sign
  out behavior. It exposes no session data, role token, credential, or auth detail.

Create and Profile expose `aria-expanded` and `aria-controls`, support Arrow keys,
Home, End, Escape, outside-click dismissal, and focus return. Visible items always
reach a real current route or action.

## Inbox, Le-E, and Settings

Inbox opens the existing Decisions surface. Its badge is hidden unless the current
decision projection exposes an actual positive `needsRoger` count; the existing local
queue status is a safe fallback when that projection is not loaded. No count is
fabricated and CCX-100 does not create a new Inbox model.

Le-E invokes the existing `openLeeBubble()` function and therefore retains the same
assistant, stored context, permissions, and propose-only boundary. The existing
floating assistant stays available and the shell does not create a second panel.
Settings opens the current surface and retains its existing role and endpoint checks.

## Routed content and behavior preservation

The routed content remains the current Today, Social, campaign/outreach, partner,
file/proof, and advanced page implementations. CCX-100 does not duplicate their
renderers, fetch their data a second time, wrap each legacy section in a new card, or
alter their forms and actions. The shell retains one semantic `main#app` region and
the current page heading. A narrow vNext-only compatibility adapter marks nested
legacy `main` elements as presentational after a route renders. It preserves their
markup, styling, attributes, children, and behavior while preventing duplicate main
landmarks.

All authorization, origin and CSRF checks, approval, suppression, hold status,
sending, publishing, storage, encryption, audit, and business rules remain outside
the UI modules and unchanged. Navigation itself performs no mutation or external
action.

## Accessibility and desktop widths

The shell supplies semantic `aside`, `nav`, `header`, and `main` landmarks; an
accessible logo link; visible focus; keyboard menus; 44-pixel practical targets;
text-backed selection; and reduced-motion handling. Browser coverage enforces zero
new serious and zero new critical axe findings, no unexpected console or page errors,
and no failed critical same-origin requests.

At 1440, 1280, and 1024 pixels the sidebar remains visible, navigation labels remain
readable, top controls remain in the viewport, and the content canvas has no
page-level horizontal overflow. At 768 and 390 pixels, CCX-101 replaces the former
stacked fallback with the complete navigation drawer and compact top bar documented
in `responsive-shell.md`. The 1440, 1280, and 1024 desktop composition remains
unchanged.

## Verification, screenshots, and performance

Run the focused contract with `npm run test:vnext-desktop-shell` and the isolated real
browser suite with `npm run test:browser`. The browser fixture starts independent
legacy and vNext servers on ephemeral loopback ports with temporary seeded JSON state,
credentials scrubbed, provider networking blocked, and all sending and publishing
gates off.

Playwright captures the seven required review images under
`docs/ux-vnext/screenshots/ccx-100/`: five destinations at 1440 pixels plus Today at
1280 and 1024 pixels. These are direct browser captures of the actual application and
its tracked fixture records; they are not edited mockups.

The vNext response adds one lightweight stylesheet and server-rendered navigation
chrome. Hash navigation continues through the existing client renderer and issues no
second document request or full-state fetch. Exact HTML, CSS, request, load-time, and
state-payload measurements are recorded in the CCX-100 pull request.

## Rollback and CCX-102 handoff

Unset `COMMAND_CENTER_UX_VNEXT` or set it to the exact string `false`, then restart or
redeploy. Rollback requires no data migration, route change, cache cleanup, or browser
preference reset because the flag is server-side and the underlying data contract is
shared.

CCX-101 keeps the same route registry, five destinations, functional controls, focus
rules, direct logo asset, feature-flag rollback, and unchanged business and safety
boundaries across the responsive drawer. CCX-102 may introduce canonical vNext route
parsing only after preserving every current alias and exact-object link.
