# CCX-003 server-side vNext shell boundary

Source main SHA: `7898dddde76b65f12c754c15a27286e675e186e9`

CCX-003 created the deployment boundary between the current Command Center shell and
the future vNext shell. CCX-100 uses that same boundary to compose the production
desktop vNext shell around the shared routed content, and CCX-101 adds its responsive
drawer without changing shell selection. The default branch still returns
the complete unchanged legacy application. Both branches retain the same routes,
aliases, deep links, safe boot, authentication, authorization, state, endpoints, and
business behavior.

## Deployment setting

The boundary reads one server environment variable at process startup:

```text
COMMAND_CENTER_UX_VNEXT=true|false
```

Parsing is deliberately strict and case-sensitive:

| Server value | Selected branch |
| --- | --- |
| `true` | vNext desktop shell branch |
| `false` | Current shell |
| Missing | Current shell |
| Any other value | Current shell |

The safe default is therefore the current shell in local, test, and hosted modes.
Values such as `1`, `yes`, `TRUE`, whitespace-padded strings, booleans, and other
invalid inputs do not enable vNext.

## Boundary behavior after CCX-100

- `scripts/ui/vnext-config.mjs` defines the pure strict-parsing contract. The module
  does not read `process.env`; the server passes its environment explicitly.
- `scripts/ui/shell-boundary.mjs` chooses one injected renderer. It owns no route,
  state, authorization, storage, sending, publishing, or business logic.
- `renderLegacyApp()` delegates to the existing `htmlShell()` implementation.
- `renderVNextApp()` passes the complete existing application through the isolated
  `renderVNextDesktopShell()` compositor. The compositor replaces only top-level
  navigation chrome; it retains the current `main#app`, client renderer, state
  serialization, route dispatch, actions, and safety behavior.
- The authenticated root response passes through `renderCommandCenterApp()` and the
  boundary. Public legal pages and authentication decisions still occur before that
  composition point.

The disabled response remains byte-for-byte identical to the merged CCX-006 legacy
shell. The enabled response now has intentionally different shell chrome while still
returning the complete working application.

## Server-side only

This is a deployment control, not a user preference. The server captures it from
`process.env` after local development environment loading and before accepting
requests. The setting is not included in rendered HTML or browser state and is not
read from:

- URL parameters or hash routes
- Form data or request bodies
- Cookies
- `localStorage` or `sessionStorage`
- Client-side JavaScript

Changing browser-controlled input therefore cannot select a shell or grant any
authority. Shell selection also cannot bypass authentication, role checks, endpoint
authorization, CSRF checks, safety gates, suppression, sending controls, publishing
controls, storage rules, or audit behavior.

## Verification

Run the focused deterministic test with an isolated test environment:

```bash
SKIP_ENV_LOCAL_FILE=1 NODE_ENV=test COMMAND_CENTER_TEST_MODE=true npm run test:vnext-shell-boundary
```

The test starts the server on ephemeral loopback ports with temporary JSON state and
all external-action controls off. It verifies missing, false, invalid, and true
values; proves the current shell is byte-stable; enters the isolated desktop shell;
and checks the live route, alias, deep-link, safe-boot, legal-route, OAuth-callback,
and social-calendar-import contracts.

For a local manual smoke check, start separate processes and confirm that the full
application remains available in both modes:

```bash
COMMAND_CENTER_UX_VNEXT=false npm run dev
COMMAND_CENTER_UX_VNEXT=true npm run dev
```

Do not attempt to switch modes from browser developer tools. A deployment or local
server restart is required because the server captures the setting at startup.

## Rollback

Remove `COMMAND_CENTER_UX_VNEXT` or set it to the exact string `false`, then restart
or redeploy the server. Invalid or missing values also fail safely to the current
shell. No data migration, storage rollback, route migration, cache conversion, or
client cleanup is required.

## Scope boundary

CCX-100 and CCX-101 change only the enabled top-level shell composition. They do not
redesign Today, Social, Outreach, Partners, Files, Inbox, Search, Settings, or Le-E;
migrate a route; or change an endpoint, record, safety gate, permission, sending rule,
or publishing rule. The full responsive drawer preserves this rollback path; CCX-102
owns future route canonicalization.
