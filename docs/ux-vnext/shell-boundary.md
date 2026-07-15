# CCX-003 server-side vNext shell boundary

Source main SHA: `7898dddde76b65f12c754c15a27286e675e186e9`

CCX-003 creates a deployment boundary between the current Command Center shell and
the future vNext shell. It does not build or expose the vNext visual shell. Both
branches currently return the complete existing application, so routes, aliases,
deep links, navigation, labels, safe boot, authentication, authorization, and all
business behavior remain unchanged.

## Deployment setting

The boundary reads one server environment variable at process startup:

```text
COMMAND_CENTER_UX_VNEXT=true|false
```

Parsing is deliberately strict and case-sensitive:

| Server value | Selected branch |
| --- | --- |
| `true` | vNext compatibility branch |
| `false` | Current shell |
| Missing | Current shell |
| Any other value | Current shell |

The safe default is therefore the current shell in local, test, and hosted modes.
Values such as `1`, `yes`, `TRUE`, whitespace-padded strings, booleans, and other
invalid inputs do not enable vNext.

## Boundary behavior in CCX-003

- `scripts/ui/vnext-config.mjs` defines the pure strict-parsing contract. The module
  does not read `process.env`; the server passes its environment explicitly.
- `scripts/ui/shell-boundary.mjs` chooses one injected renderer. It owns no route,
  state, authorization, storage, sending, publishing, or business logic.
- `renderLegacyApp()` delegates to the existing `htmlShell()` implementation.
- `renderVNextApp()` is an isolated compatibility renderer that delegates to
  `renderLegacyApp()` until a later packet builds the new shell.
- The authenticated root response passes through `renderCommandCenterApp()` and the
  boundary. Public legal pages and authentication decisions still occur before that
  composition point.

The enabled and disabled responses are intentionally byte-for-byte identical in
this packet. The enabled branch proves the deployment switch without creating a
blank, partial, static, or misleading application.

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
values; compares current and compatibility shell output; and checks the live route,
alias, primary-navigation, deep-link, safe-boot, legal-route, OAuth-callback, and
social-calendar-import contracts.

For a local manual smoke check, start separate processes and confirm that the full
current application remains available in both modes:

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

CCX-003 changes only top-level shell composition. It does not implement the navy
sidebar, the five-destination navigation, design tokens, new labels, UI primitives,
feature redesigns, compact APIs, route migrations, or any later packet. CCX-004 may
extract shared UI primitives while preserving the same behavior and rollback path.
