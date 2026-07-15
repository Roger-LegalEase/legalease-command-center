# Extended test follow-up

Baseline recorded on 2026-07-14: **40 passed, 38 failed, 78 total** in an isolated allowlisted environment. No process timed out, no external provider was called, and no failure was verified as a P0 security regression. This suite is not green. The classifications below permit review of the security branch only because equivalent focused P0 coverage passes and the remaining work is explicitly separated.

## Restricted-environment or legacy server-startup failures

These 13 tests fail while starting legacy fixed-port or non-hermetic server harnesses in the restricted environment. They must move to the shared ephemeral-port harness with bounded requests and deterministic teardown.

| Test | Category | Equivalent focused coverage | Blocks this branch? | Precise follow-up action | Separate workstream |
|---|---|---|---|---|---|
| `test-client-script-syntax.mjs` | restricted/startup | Partial: `npm run check` and canonical client/layout syntax checks passed. | No; startup failure, not a verified security regression. | Run generated-client parsing through `preview-server-harness.mjs` on port 0 and retain the same syntax assertions. | Hermetic server harnesses |
| `test-generated-client-script-syntax.mjs` | restricted/startup | Partial: syntax gate and canonical shell checks passed. | No. | Replace the legacy server launcher with the shared harness, a bounded fetch, and `finally` teardown. | Hermetic server harnesses |
| `test-linkedin-oauth-callback.mjs` | restricted/startup | Partial: focused OAuth state validation/replay coverage passed. | No; provider-specific callback behavior still needs its legacy harness repaired. | Seed a synthetic owner session, mock token/profile exchanges, use port 0, and preserve callback assertions. | Connector harnesses |
| `test-meta-connector.mjs` | restricted/startup | Partial: shared OAuth state and live-gate controls passed. | No. | Mock Meta discovery/token responses and migrate the server lifecycle to the shared harness. | Connector harnesses |
| `test-no-white-screen.mjs` | restricted/startup | Partial: canonical boot, safe-mode, and layout checks passed. | No. | Use the shared harness and assert shell/boot responses with bounded fetches instead of a fixed-port process. | Hermetic server harnesses |
| `test-oauth-state-security.mjs` | restricted/startup | Yes: `npm run test:oauth-state` passed directly with an ephemeral port. | No. | Make the extended runner grant the same loopback capability or route this test only through the focused HTTP job. | CI test topology |
| `test-privacy-route.mjs` | restricted/startup | No direct P0 equivalent; the failure occurred before route assertions. | No; public legal copy is outside the P0 security gate. | Move to the shared harness and retain unauthenticated `/privacy` response assertions. | Public-route harnesses |
| `test-production-hardening-health.mjs` | restricted/startup | Yes: production startup guard and hosting-readiness tests passed. | No. | Replace fixed-port startup with port 0 and reuse synthetic hosted configuration. | Hermetic server harnesses |
| `test-public-legal-pages.mjs` | restricted/startup | No direct P0 equivalent; failure was server startup. | No. | Rework both legal-page requests onto one ephemeral server with bounded fetches and teardown. | Public-route harnesses |
| `test-rbac-http-hardening.mjs` | restricted/startup | Yes: `npm run test:rbac-http` passed directly. | No. | Run this test only in the loopback-enabled focused job or give the extended job equivalent ephemeral-port permissions. | CI test topology |
| `test-scheduled-publishing.mjs` | restricted/startup | Partial: focused durable social-publish claim and live-gate tests passed. | No; scheduler UI/worker legacy assertions remain separate. | Migrate startup to port 0, mock every provider, and keep publish claims/live gates asserted. | Social scheduler harness |
| `test-version-endpoint.mjs` | restricted/startup | Partial: authenticated startup/readiness and version-related canonical checks passed. | No. | Use the shared harness, stub any remote drift lookup, and retain the exact safe response shape assertion. | Diagnostics harnesses |
| `test-webhook-http-security.mjs` | restricted/startup | Yes: `npm run test:webhook-http` passed directly. | No. | Run in the loopback-enabled focused job or align extended-job permissions with the existing ephemeral harness. | CI test topology |

## Stale assertions against intentional security/storage behavior

These five tests execute but assert pre-hardening contracts. Their assertions must be updated only to the already-reviewed fail-closed, session, capability, and versioned-storage behavior.

| Test | Category | Equivalent focused coverage | Blocks this branch? | Precise follow-up action | Separate workstream |
|---|---|---|---|---|---|
| `test-env-contract.mjs` | stale assertion | Yes: startup guards, secret scan, and PII scan passed. | No. | Replace legacy optional-production variables with the current required hosted contract and keep every outbound default false. | Security contract tests |
| `test-no-filesystem-production-db.mjs` | stale assertion | Yes: hosted startup rejects JSON/local storage. | No. | Assert the active Supabase adapter and fail-closed startup instead of the retired `DATABASE_URL` adapter wording. | Storage contract tests |
| `test-route-map-integrity.mjs` | stale assertion | Partial: request security, session/CSRF, and RBAC HTTP suites passed. | No. | Update the route inventory for login, reports, private assets, OAuth, webhook, metrics, and reconciliation capabilities without broad route refactoring. | Route contract tests |
| `test-social-posting-safety.mjs` | stale assertion | Yes: social capability, live-gate, and durable publish-claim tests passed. | No. | Replace the old direct-publish expectations with claim-before-call, reconciliation, and dedicated capability assertions. | Social safety contracts |
| `test-storage-durability.mjs` | stale assertion | Yes: concurrency, 1,207-record atomic diff, migration validation, and restore drill passed. | No. | Assert CAS/versioned record diffs and explicit development JSON opt-in instead of snapshot reconciliation behavior. | Storage contract tests |

## Unrelated legacy UI or connector failures

These 20 failures are outside the production-security closeout. They receive no implementation changes on this branch.

| Test | Category | Equivalent focused coverage | Blocks this branch? | Precise follow-up action | Separate workstream |
|---|---|---|---|---|---|
| `test-activation-center.mjs` | unrelated legacy UI | N/A; not a P0 control. | No. | Rebaseline activation-center selectors and copy against the current UI in a dedicated UI pass. | Legacy UI regression |
| `test-app-status-recovery.mjs` | unrelated legacy UI | N/A; startup/restore P0 checks passed separately. | No. | Separate UI recovery messaging assertions from the already-passing synthetic restore drill. | Legacy UI regression |
| `test-calendar-readonly-safety.mjs` | unrelated connector | N/A; no provider call occurred. | No. | Update the mocked Calendar connector fixture and retain read-only/no-write scope assertions. | Google connector regression |
| `test-connector-readiness.mjs` | unrelated connector | N/A; hosted startup checks passed. | No. | Reconcile legacy connector readiness copy and fixture shape without changing security requirements. | Connector regression |
| `test-every-visible-button-works.mjs` | unrelated legacy UI | N/A. | No. | Refresh the button inventory and isolate flaky navigation/click assertions by workspace. | Legacy UI regression |
| `test-external-action-outbox.mjs` | unrelated legacy UI | N/A; outbound gates and claims passed separately. | No. | Update outbox fixture/state expectations while preserving honest-zero and no-send behavior. | Legacy UI regression |
| `test-founder-language-and-clutter.mjs` | unrelated legacy UI | N/A. | No. | Review copy expectations with product ownership in a separate content/UI change. | UI content regression |
| `test-held-contact-disposition.mjs` | unrelated legacy UI | N/A; no P0 regression identified. | No. | Rebaseline disposition fixtures and retain hold/no-enroll/no-send invariants. | Contact workflow regression |
| `test-linkedin-connect-button.mjs` | unrelated connector UI | Partial: OAuth state security passed. | No. | Update connect-button navigation to the current protected OAuth start route using mocked responses. | LinkedIn connector regression |
| `test-linkedin-readiness.mjs` | unrelated connector | Partial: OAuth state and publish claims passed. | No. | Reconcile readiness copy/fixture fields with encrypted-token and live-gate posture. | LinkedIn connector regression |
| `test-proof-workspace.mjs` | unrelated legacy UI | N/A. | No. | Rebaseline workspace structure and selectors independently of security code. | Legacy UI regression |
| `test-queue-workspace.mjs` | unrelated legacy UI | N/A. | No. | Update queue workspace fixture assumptions and split behavior from presentation checks. | Legacy UI regression |
| `test-rcap-page-usability.mjs` | unrelated legacy UI | N/A. | No. | Review RCAP usability selectors/copy in the RCAP UI workstream. | RCAP UI regression |
| `test-social-workspace.mjs` | unrelated legacy UI | Partial: social claims and gates passed. | No. | Rebaseline social workspace rendering without weakening approval/claim assertions. | Social UI regression |
| `test-sources-social-calendar-import.mjs` | unrelated connector/UI | N/A; no provider call occurred. | No. | Repair synthetic import fixtures and current source/calendar schema expectations. | Social connector regression |
| `test-today-email-followups.mjs` | unrelated legacy UI | N/A; email gates remained off. | No. | Update Today-page email follow-up fixtures while retaining no-send behavior. | Today UI regression |
| `test-today-standup-page.mjs` | unrelated legacy UI | N/A. | No. | Rebaseline standup-page layout and current state projection in a dedicated UI pass. | Today UI regression |
| `test-twitter-x-oauth-callback.mjs` | unrelated connector | Partial: shared OAuth state coverage passed. | No. | Use synthetic PKCE/session state and mocked X token/profile responses in a hermetic callback test. | X connector regression |
| `test-twitter-x-readiness.mjs` | unrelated connector | Partial: OAuth state and live-gate controls passed. | No. | Update readiness fixture/copy for encrypted tokens, callback configuration, and disabled posting. | X connector regression |
| `test-ux-emergency-repair.mjs` | unrelated legacy UI | N/A. | No. | Break the broad legacy test into bounded workspace assertions and rebaseline separately. | Legacy UI regression |

## Recommended execution order

1. Repair the 13 hermetic server/CI harness failures without changing product behavior.
2. Update the five stale contracts against the reviewed security and storage behavior.
3. Address the 20 UI/connector failures in their named workstreams.
4. Rerun all 78 extended tests in the isolated environment and remove this exception only when the suite is honestly green or an independently approved policy supersedes it.
