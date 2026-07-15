# Command Center browser testing

## Purpose

CCX-005 adds Chromium tests for the current Command Center. The suite exercises the
served application in a real browser; it does not replace the existing Node, route,
security, migration, restore, or source-level contracts. This packet makes no runtime
HTML, CSS, route, endpoint, data-model, authorization, sending, or publishing change.

## Dependencies and commands

The development dependencies are `@playwright/test` and `@axe-core/playwright`.
Install the locked dependency tree and Chromium, then run the suite:

```text
npm ci
npm run test:browser:install
npm run test:browser
```

Extra Playwright CLI arguments can be passed after `--`. For example, repeat the
complete suite twice with `npm run test:browser -- --repeat-each=2`.

## Fixture lifecycle and isolation

`scripts/run-browser-tests.mjs` owns the complete fixture lifecycle:

1. It removes only generated `test-results/` and `playwright-report/` output.
2. It creates an operating-system temporary directory.
3. It starts two copies of the existing `scripts/preview-server.mjs` on port `0`
   at `127.0.0.1`: the default shell and the vNext compatibility boundary.
4. Each server bootstraps an independent mutable JSON state file from the tracked
   `data/seed/social-command-center.seed.json` seed.
5. It waits for the real `/api/health` contract to return `{ "status": "ok" }`.
6. It runs Chromium with dynamic loopback base URLs.
7. It terminates child processes, writes redacted server logs, and removes the
   temporary state on success, failure, SIGINT, or SIGTERM.

The runner passes an explicit environment allowlist instead of the developer's full
environment. `SKIP_ENV_LOCAL_FILE=1` prevents `.env.local` loading. JSON/local-demo
storage and local authentication are explicit. No Supabase, SendGrid, Stripe, social
OAuth, OpenAI, or other provider credential reaches either server or Playwright.
`scripts/test-support/browser-network-guard.mjs` fails every non-loopback server-side
fetch deterministically. Chromium fulfills non-loopback resource requests with an
empty local response, so the test never contacts a provider or font host.

Every email, outreach, alert, social-publishing, provider-webhook, and discovery gate
is explicitly off. The Daily Run runway-input save is the only mutating smoke action.
It writes only to the disposable fixture and the test proves the safety posture is
unchanged.

## Browser configuration

- Browser: Playwright Chromium
- Viewport: 1440 by 900
- Locale: `en-US`
- Time zone: `America/New_York`
- Workers: one
- Test timeout: 30 seconds
- Retries: one in CI, none locally
- Failure evidence: screenshot, retained video, first-failure trace, HTML report,
  and redacted preview-server logs

Locators use roles, accessible names, headings, and current stable structure. Tests
wait for `window.__LE_BOOT.ready`, visible landmarks, URLs, responses, and state; they
do not use arbitrary fixed sleeps or depend on test order.

## Smoke coverage

The six browser tests cover:

- the local authenticated app and current Today route loading with a semantic main
  region and visible heading;
- the server-enabled vNext compatibility branch returning the complete usable app;
- visible Today to current Social workspace (`Review Desk`) to Today navigation,
  including hash and active-state synchronization;
- the current Social review workspace rendering real fixture work rather than a
  static placeholder;
- a local Daily Run runway update immediately showing working feedback, swallowing a
  duplicate click, returning visible success, and leaving sending/publishing posture
  unchanged;
- rendered axe scans for Today and the current Social workspace.

`Review Desk` is intentionally used as the current UI entry point for Social. CCX-005
does not apply the future founder-language migration.

## Client-error and network policy

Every uncaught page error and every unexpected `console.error` fails its test.
Same-origin request failures fail, as do HTTP failures from the boot state, full state,
Today summary, campaign command, and tested local-action workflow endpoints. Optional health
diagnostics may honestly return unavailable without being classified as a broken user
workflow.

Two exact, pre-existing console exceptions are registered in
`tests/browser/baselines.mjs`. The current shell requests the Google-hosted Geist
stylesheet while its own Content Security Policy permits styles and connections only
from self. Chromium reports one `style-src` and one `connect-src` error; the browser
blocks the request and the local font stack renders, so these errors are non-fatal.
Their URL and CSP directives are matched exactly. Broader console suppression is not
allowed. CCX-006 owns resolving the font/design-system mismatch.

## Accessibility policy and current baseline

Rendered `main#app` content is scanned against WCAG 2 A/AA and WCAG 2.1 A/AA tags.
Any new critical or serious violation fails. Baseline entries compare the exact axe
rule, severity, and sorted selector set; adding, changing, or removing affected nodes
requires an intentional baseline review.

There are two pre-existing serious exceptions and no critical exceptions:

| Route | Rule | Affected selector/signature | Impact | Reason | Owner |
| --- | --- | --- | --- | --- | --- |
| Today (`#today`) | `color-contrast` | Exact 56-selector set in `tests/browser/baselines.mjs`; newline-joined SHA-256 `294b1b8007bdda720a0bc84602de5ff513edadb0a072636d5edb49fb6b0a1535` | Serious | Existing Today text and status colors do not meet the axe contrast threshold. | CCX-006 design-system packet |
| Current Social workspace (`#queue`) | `color-contrast` | `.wizard-actions > .primary[type="button"]`; SHA-256 `517e247f5da422efa0f385e174333ade211f2aedfa8ff68950c437e2bc4cd611` | Serious | The existing Review Desk primary action color combination does not meet the axe contrast threshold. | CCX-006 design-system packet |

No axe rule is disabled, and there is no broad selector or route exclusion.

## Artifacts and CI

The GitHub Actions `browser` job uses Node 24, installs from the lockfile, installs
Chromium with its Linux dependencies, and runs `npm run test:browser` without secrets.
It does not use `continue-on-error` and does not weaken an existing job. On failure it
uploads `playwright-report/` and `test-results/` for 14 days. Mutable fixture state is
outside those directories and is deleted, so it cannot become an artifact.

Locally, open `playwright-report/index.html` for the HTML report or inspect the trace
path printed by Playwright. Server logs are `test-results/browser-server-legacy.log`
and `test-results/browser-server-vnext-compatibility.log`; they are redacted and do
not contain request payloads.

If Chromium is missing, rerun `npm run test:browser:install`. If startup fails, inspect
the server logs. A clean checkout needs no untracked local state file and no service
credential.

## Adding coverage later

Add focused `.spec.mjs` files under `tests/browser/` and import the monitored `test`,
`expect`, and boot helpers from `support.mjs`. Prefer semantic locators. Keep mutations
within the disposable fixture, keep live gates off, and add a provider mock rather than
allowing external access. A new accessibility or console baseline needs a precise
route, rule/message, selector or stable signature, impact, pre-existing explanation,
and remediation packet; never suppress a category to make CI green.
