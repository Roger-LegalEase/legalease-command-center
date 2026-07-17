# Command Center vNext responsive shell

## Scope and architecture

CCX-101 makes the approved five-destination shell usable from mobile through desktop
without changing any destination renderer, route, endpoint, record, permission, or
business operation. The strict server-side `COMMAND_CENTER_UX_VNEXT` deployment flag
still owns the complete rollback boundary. Missing, false, or invalid values return
the legacy application byte for byte; only the exact string `true` enables the vNext
shell.

The existing pure compositor in `scripts/ui/app-shell.mjs` still surrounds one shared
`main#app`, route dispatcher, state payload, action layer, and Le-E assistant. The
responsive behavior reuses the exact route and destination contracts from
`scripts/ui/app-shell-navigation.mjs`. It does not add a second client application,
router, navigation registry, or assistant.

## Breakpoints

| Viewport | Shell behavior |
| --- | --- |
| 1440px | Approved 15rem persistent sidebar and full desktop top bar |
| 1280px | Same approved persistent desktop shell |
| 1024px | Existing compact desktop sidebar width; full route access remains visible |
| 768px | Compact top bar plus off-canvas navigation drawer |
| 390px | Compact top bar plus the same off-canvas navigation drawer |

The drawer breakpoint is `860px`. Widths above it keep the CCX-100 desktop shell.
Widths at or below it use the complete responsive drawer rather than the former
stacked emergency fallback.

## Mobile and tablet top bar

The compact top bar contains:

- an accessible **Open navigation** trigger;
- the current resolved destination as page context;
- the shared CCX-104 Search, Help, and Profile controls in compact accessible form;
  and
- the persistent orange **Create** action.

Create uses the same CCX-103 contract as desktop: **Social post**, **Outreach
campaign**, **Partner**, **File or folder**, and **Quick note**. Task remains in Today
and Tasks rather than the global menu. The shared mobile creation sheet closes the
navigation drawer first, stays inside the viewport, contains focus, supports dirty
close confirmation, and preserves Escape, outside-click, and focus-return behavior.
The drawer keeps routed content and non-Create top-bar controls inert while leaving
the single persistent orange Create trigger operable. Activating it removes the
drawer overlay, inert state, and drawer scroll lock before opening the shared Create
surface, so the two modal layers never overlap.
Persistent folders remain truthfully disabled because the current Files system has no
folder model.

Search remains visibly labelled at responsive widths and opens the same six-group
palette as desktop. While the navigation drawer is open, the persistent Search
control remains operable like Create. Activating it closes the drawer, removes its
overlay, inert state, and scroll lock, then opens exactly one full-width Search sheet
with focus in the labelled input. Search also safely dismisses the Create menu/sheet
and Profile menu so modal and popover layers do not overlap.

CCX-105 uses the same shell-state implementation at responsive widths. Loading,
module-error, unauthorized, session-expired, and Recovery Mode content stays inside
the viewport below the persistent compact top bar. Session or shell failure closes
the drawer and authenticated overlays, removes inert/scroll-lock residue, and leaves
exactly one active state surface. Search and Create are disabled only when the
authenticated full state they require is unavailable.

## Navigation drawer

The drawer renders the exact official white wordmark directly from
`assets/brand/logos/legalease-logo-white-2025.png`. Its source 1920:1080 aspect ratio,
transparent background, and `object-fit: contain` treatment are preserved. No
monogram, short mark, retyped wordmark, recolor, crop, or substitute asset is used.

The drawer contains, in order:

1. Today
2. Social
3. Outreach
4. Partners
5. Files
6. A visual divider
7. Inbox
8. Le-E
9. Settings

It uses the same deep navy, soft teal selected state, text-backed indicator, orange
real-count badge, and exact destination resolver as desktop. Canonical routes, all
legacy aliases, parameterized `#item/<collection>/<id>` links, and unknown-route
fallback continue to select the same destination without rewriting the underlying
hash.

## Keyboard and focus behavior

When the drawer opens:

- `aria-expanded` becomes true on the trigger;
- the drawer becomes a labelled modal dialog at responsive widths;
- focus moves to the visible Close navigation control;
- the routed stage becomes inert;
- Tab and Shift+Tab remain inside the drawer; and
- body scrolling is locked.

Escape or the overlay closes the drawer and returns focus to the Open navigation
trigger. The visible close button is always available. Choosing any destination or
utility closes the drawer so the newly rendered page is reachable immediately.
Resizing above the responsive breakpoint closes and resets the drawer, removes modal
semantics and inert state, and restores the persistent desktop sidebar.

## Narrow content handling

The shell prevents page-level horizontal overflow and keeps the top bar, drawer,
menus, logo, and routed content within the viewport. Shell controls use the shared
44px practical touch target. Legacy destination content is not redesigned in this
packet; it remains reachable through the existing page scroll and responsive rules.
The shell uses only shared design tokens and keeps reduced-motion behavior from the
design-system contract.

## Accessibility and safety boundaries

The responsive shell retains one semantic main region, accessible navigation names,
visible focus, text-backed selected state, `aria-current`, a labelled drawer, focus
containment, Escape dismissal, focus return, and reduced-motion behavior. Browser
coverage scans the rendered tablet and mobile drawer and requires zero serious and
zero critical axe violations, zero unexpected console/page errors, and no horizontal
overflow at all five required widths.

Navigation performs no data mutation or provider action. Search, Create, Inbox, Le-E,
Settings, Help, Profile, and every routed page keep their existing server-side role,
authorization, origin, CSRF, approval, suppression, hold, sending, publishing,
storage, audit, and safety behavior. Opening the drawer cannot enable vNext or grant
authority.

CCX-201 uses the same authorized Needs me badge value in the persistent desktop
sidebar and responsive drawer. Zero hides the badge; session expiration and Recovery
Mode clear it. The responsive Inbox list, group controls, filters, and 44-pixel Open
targets are documented in `inbox-page.md` and introduce no drawer-specific request.

CCX-202 uses the same compact authorized action declarations on desktop and mobile.
At 390 pixels confirmation and dated Snooze use the accessible full-width dialog,
preserve drawer/Search/Create/Profile/Le-E behavior, and refresh the shared badge
through the compact Inbox response without a second mobile request.

## Verification and screenshots

Run the focused contract with `npm run test:vnext-responsive-shell` and the isolated
Chromium suite with `npm run test:browser`. Playwright captures the actual responsive
shell at 1440, 1280, 1024, 768, and 390 pixels under
`docs/ux-vnext/screenshots/ccx-101/`, including open-drawer views at 768 and 390 and a
390-pixel Social view. Fixture state is temporary, providers are blocked, credentials
are scrubbed, and all live-action gates remain off.

## Rollback and Phase 1 handoff

Unset `COMMAND_CENTER_UX_VNEXT` or set it to the exact string `false`, then restart or
redeploy. No migration, storage rollback, route cleanup, browser preference, or state
conversion is required.

CCX-102 preserves the 75 canonical routes, 53 aliases, generic item links, and exact
record links. CCX-105 completes the responsive Phase 1 shell-state contract without
beginning CCX-200.

CCX-204 uses this unchanged shell at 768 and 390 pixels. Its content stacks strictly Now, Next, Needs You, and Progress; Start/Resume remains a labelled full-width mobile target, explanations remain visible, and the existing Quick Capture route appears once. Le-E remains available from the drawer; the redundant floating pill is suppressed on Today so it cannot cover page content. See `today-page.md`.
