# CCX-000 verified baseline

Baseline date: 2026-07-15\
Repository: `Roger-LegalEase/legalease-command-center`\
Branch: `codex/ccx-000-verified-baseline`\
PR title: `CCX-000: Establish the vNext verified baseline.`\
Inspected `origin/main`: `fd1868369d80cafa8ffecf272e0b381c6f51e632`

This document records the repository state before any Command Center vNext shell or
feature work. CCX-000 adds documentation and the two supplied, approved visual inputs
only. It does not change runtime behavior, the data model, storage, authorization,
sending, publishing, safety gates, navigation, design tokens, or the visual shell.

## Reproduction environment

- Node.js `v24.14.0`
- npm `11.9.0`
- Linux `6.8.0-1052-azure`, x86_64
- Tests ran with `SKIP_ENV_LOCAL_FILE=1`, `NODE_ENV=test`,
  `COMMAND_CENTER_TEST_MODE=true`, a minimal environment, temporary data paths,
  ephemeral ports, synthetic sessions, mocked providers, and no inherited developer
  or production credentials.

## Required visual inputs

Both supplied assets were readable, recognized as PNG files, and successfully decoded
before baseline work began. They are preserved byte-for-byte from
`legalease-command-center-vnext-codex-kit.zip`.

| Approved input | Dimensions | Type | SHA-256 |
| --- | ---: | --- | --- |
| `assets/brand/logos/legalease-logo-white-2025.png` | 1920 x 1080 | PNG, 8-bit RGBA, non-interlaced | `0d1417dd03fa0ad83044780423db97f23193cc10a8dd1b5c4d121c1200d22b4b` |
| `docs/ux-vnext/reference/command-center-vnext-approved-direction.png` | 1536 x 1024 | PNG, 8-bit RGB, non-interlaced | `30fdf725169a0dc19aec20e4b94f8b06263493e992173d4f2b1bdc767aa093b2` |

The supplied master plan is present at
`LEGALEASE_COMMAND_CENTER_MASTER_BUILD_PLAN_CODEX.md`. Its eight header hard breaks
use Markdown backslashes instead of trailing spaces so the repository whitespace gate
remains clean; its meaning and rendering are unchanged.

## Current routes

The current UI is a single server-rendered shell using hash routes. Its six primary
navigation entries are:

| Label | Hash route |
| --- | --- |
| Today | `#today` |
| Queue | `#decisions` |
| Campaigns | `#campaigns` |
| Review Desk | `#queue` |
| Reports | `#reports` |
| More | `#more` |

Le-E is available from the floating assistant control and `#lee`; it is not a primary
navigation entry. Item deep links use `#item/<collection>/<id>`. Unknown routes fall
back to Today.

The server currently registers these 75 page identifiers:

```text
cockpit, upload, contacts, prospects, revenue, meetings, support, alerts, pages,
today, overview, daily-run, focus, decisions, lee, growth, partner-hub, production,
production-linkedin-queue, production-twitter-x-queue, proof, more, growth-inbox,
capture-inbox, tasks, tasks-today, tasks-blocked, tasks-waiting, tasks-this-week,
production-activation-rcap, operating-memory, morning-brief, evening-reflection,
daily-closeout, os-health, smoke-test, evidence-room, handoff-contract,
operator-manual, roles, data-integrity, operator-search, conversation-notes,
partner-programs, partner-pages, partner-dashboards, partner-reports,
partner-proposals, milestones, partners, campaigns, funnel, content-bank, queue,
sources, assets, posted, autonomy, automation, pilots, compliance, soc2,
soc2-access, soc2-audit, soc2-changes, soc2-vendors, soc2-incidents,
soc2-evidence, soc2-policies, reports, dataroom, metrics, settings, safe-mode, item
```

The current compatibility aliases are:

```text
overview -> today                    cockpit -> today
command -> growth                    le-e -> lee
partner -> partners                  partner-hub -> partners
metrics -> proof                     kpis -> proof
marketing -> growth                  social -> growth
social-media -> growth               content-calendar -> growth
posts -> growth                      rcap -> production-activation-rcap
app-status -> os-health              health -> os-health
recovery -> safe-mode                guide -> operator-manual
course-manual -> operator-manual     data-check -> data-integrity
handoff-notes -> handoff-contract    privacy -> settings
replies -> growth-inbox              inbox-replies -> growth-inbox
lists -> contacts                    contact -> contacts
people -> contacts                   upload-list -> upload
list-upload -> upload                import -> upload
import-list -> upload                campaign -> campaigns
campaign-control -> campaigns        campaigns-control -> campaigns
prospect -> prospects                prospects -> prospects
rcap-prospects -> prospects          rcap-pipeline -> prospects
money -> revenue                     payments -> revenue
stripe -> revenue                    calendar -> meetings
meeting -> meetings                  meeting-prep -> meetings
support-inbox -> support             notifications -> alerts
alert-center -> alerts               partner-pages-review -> pages
page-review -> pages                 co-branded-pages -> pages
system -> os-health                  linkedin -> production-linkedin-queue
twitter-x -> production-twitter-x-queue
```

## Current feature and safety controls

There is no `COMMAND_CENTER_UX_VNEXT` feature flag on current main. The existing shell
is the only shell; adding a vNext flag is later-packet work.

| Area | Current controls | Baseline posture |
| --- | --- | --- |
| Local/demo storage | `LOCAL_DEMO_MODE`, `STORAGE_BACKEND`, `COMMAND_CENTER_ALLOW_JSON`, `USE_SUPABASE_JS_STORE` | JSON storage requires explicit local permission; hosted production requires durable storage. |
| Authentication | `COMMAND_CENTER_REQUIRE_AUTH`, `COMMAND_CENTER_AUTH_DISABLED` | Hosted production rejects disabled or incomplete authentication configuration. |
| Image fallback | `ALLOW_LOCAL_IMAGE_FALLBACK` | Optional local fallback; no setting was changed. |
| Email sending | `OUTREACH_LIVE_SEND`, `REACTIVATION_LIVE_SEND`, `REACTIVATION_SEND_DISABLED`, `ALERTS_LIVE_SEND` | Live-send controls default off. Reactivation also has an independent kill switch. Provider readiness, approval, suppression, and policy checks remain required. |
| Social publishing | `LINKEDIN_LIVE_POSTING_ENABLED`, `ENABLE_LIVE_LINKEDIN_POSTING`, `ENABLE_LIVE_X_POSTING`, `ENABLE_LIVE_TWITTER_POSTING`, `ENABLE_LIVE_FACEBOOK_POSTING`, `ENABLE_LIVE_INSTAGRAM_POSTING`, `ENABLE_LIVE_THREADS_POSTING` | Live publishing is disabled unless the channel-specific control and all downstream authorization/safety requirements are satisfied. |
| Automation | `AUTOPILOT_<ENGINE_ID>` and persisted `autopilotSettings` | Autopilot is off by default. |

The measured `/api/safety/posture` response reported email `off`, social `off`, and no
enabled social channels. Hosted production is designed to fail closed when required
durable storage, authentication, session/encryption configuration, or webhook
verification is missing. CCX-000 made no safety, authorization, sending, publishing,
storage, or data-model changes.

## Demo-data commands

The repository exposes these demo scripts:

```text
npm run demo:load
npm run demo:packages
npm run demo:prepare
npm run local:restart
```

The safe local JSON load used for this baseline was:

```bash
ALLOW_DEMO_DATA=1 STORAGE_BACKEND=json COMMAND_CENTER_ALLOW_JSON=true npm run demo:load
```

`demo:load` refuses to run without `ALLOW_DEMO_DATA=1` and refuses Supabase-backed
storage. On a clean current-main archive, it also expects
`data/social-command-center.json`, which is not tracked. The baseline load was
therefore verified in a temporary clean archive after copying the tracked
`data/seed/social-command-center.seed.json` to that expected local path. It produced
5 posts, 6 partners, 5 campaigns, 7 milestones, 3 pilots, 12 data-room items, and 3
funnel snapshots. This clean-checkout prerequisite is a pre-existing limitation; no
repository data or loader behavior was changed.

## Representative payload sizes

Measurements used an archived copy of the recorded main SHA, the repository preview
server harness, an ephemeral loopback port, a temporary JSON data path, the synthetic
demo dataset described above, a synthetic owner session, mocked/no external providers,
and all live-action gates off. Sizes are raw response-body bytes, not compressed wire
sizes.

| Representative response | Bytes |
| --- | ---: |
| Root shell HTML, `/` | 1,433,993 |
| Boot state, `/api/boot-state` | 27,206 |
| Full state, `/api/state` | 282,948 |
| Today summary, `/api/today/summary` | 7,487 |
| Campaign command, `/api/campaign/command` | 4,167 |
| Partner programs overview, `/api/partner-programs/overview` | 10,058 |
| Evidence room, `/api/evidence-room` | 62,446 |
| Safety posture, `/api/safety/posture` | 1,079 |
| Health, `/api/health` | 15 |

Some workspaces do not have dedicated endpoints, so compact JSON slices were also
measured from `/api/state`:

| State slice | Bytes | Records included |
| --- | ---: | --- |
| Social | 47,665 | 79 across posts, content bank, post images, social accounts, publish events, library, and brand assets |
| Outreach | 7,853 | 9 across campaigns, contacts/attempts/suppressions/reactivation collections, and approval queue |
| Partners | 10,647 | 9 across partners, partner programs, and artifacts |
| Proof | 24,340 | 31 across reports, data-room items, evidence-pack notes, and SOC 2 evidence |

Hash fragments are not sent to the server. The large root HTML contains the current
shell, after which the client fetches boot and full state. These figures are
representative synthetic-demo measurements, not production traffic captures or
performance budgets.

## Current logo usage

The shell currently renders a text lockup:

```html
<a class="brand-lockup" href="#today"><span>LegalEase</span><strong>Command Center</strong></a>
```

Existing runtime and seed references use:

- `assets/brand/logos/legalease-logo-2025-ob.png` (1882 x 462, PNG RGBA) as the
  current full-logo brand asset.
- `assets/brand/logos/legalease-mark-white.png` (1002 x 993, PNG RGBA) for brand
  asset metadata, preview/final-image rendering, and watermark fallbacks.

The newly supplied approved `legalease-logo-white-2025.png` is present and verified
but is not wired into the current runtime. Logo wiring belongs to CCX-006, so CCX-000
does not change the shell or any current logo reference.

## Verification results

All results below were obtained at the recorded `origin/main` SHA before any runtime
code changes. CCX-000 changes only documentation and supplied binary inputs, so every
listed failure is pre-existing rather than a CCX-000 regression.

| Command | Result | Notes |
| --- | --- | --- |
| `npm ci` | PASS | Installed exactly from `package-lock.json`. |
| `npm run check` | PASS | Syntax gate. |
| `npm test` | PASS | Canonical test suite. |
| `npm run test:extended` | FAIL (pre-existing) | 78 run, 47 passed, 31 failed, 0 quarantined. Failure inventory follows. |
| `npm run test:security-hardening` | PASS | Session, OAuth-state, webhook, and RBAC HTTP hardening checks passed. |
| `npm run secret:scan` | PASS | No tracked secret findings. |
| `npm run pii:scan` | PASS | No tracked PII findings. |
| `npm run migrations:validate` | PASS | One migration validated. |
| `npm run restore:drill` | PASS | Synthetic restore drill completed. |
| `npm run verify:production` | FAIL (pre-existing) | Its audit stage passed, then the verifier expected legacy health metadata (`appRunning === true`) that the current 15-byte health response does not expose; the actual value was `undefined`. |

### Pre-existing extended-suite failures

The repository's existing `docs/extended-test-follow-up.md` groups the known extended
debt. In this environment, 7 of its previously restricted loopback cases passed,
leaving these 31 failures:

- Stale security/storage contract assertions (5):
  `test-env-contract.mjs`, `test-no-filesystem-production-db.mjs`,
  `test-route-map-integrity.mjs`, `test-social-posting-safety.mjs`, and
  `test-storage-durability.mjs`.
- Legacy UI/connector assertions (20):
  `test-activation-center.mjs`, `test-app-status-recovery.mjs`,
  `test-calendar-readonly-safety.mjs`, `test-connector-readiness.mjs`,
  `test-every-visible-button-works.mjs`, `test-external-action-outbox.mjs`,
  `test-founder-language-and-clutter.mjs`, `test-held-contact-disposition.mjs`,
  `test-linkedin-connect-button.mjs`, `test-linkedin-readiness.mjs`,
  `test-proof-workspace.mjs`, `test-queue-workspace.mjs`,
  `test-rcap-page-usability.mjs`, `test-social-workspace.mjs`,
  `test-sources-social-calendar-import.mjs`, `test-today-email-followups.mjs`,
  `test-today-standup-page.mjs`, `test-twitter-x-oauth-callback.mjs`,
  `test-twitter-x-readiness.mjs`, and `test-ux-emergency-repair.mjs`.
- Legacy server-harness/route-shape assertions (6):
  `test-linkedin-oauth-callback.mjs`, `test-meta-connector.mjs`,
  `test-privacy-route.mjs`, `test-production-hardening-health.mjs`,
  `test-public-legal-pages.mjs`, and `test-scheduled-publishing.mjs`.

The production verifier failure is consistent with the stale health-route assertion
already represented by `test-production-hardening-health.mjs`. It was not isolated by
a runtime fix because changing the health contract is outside CCX-000 and is not
required to distinguish the main-branch baseline from regressions.

## Baseline conclusion and known limitations

- No runtime file changed, so there are no CCX-000 behavioral regressions.
- The extended suite and production verifier are not fully green on the recorded main
  SHA; their exact pre-existing failures are recorded above and remain follow-up debt.
- A clean-checkout `demo:load` requires creation of its ignored local state file from
  the tracked seed before the safe local command can run.
- Payload measurements use the repository's synthetic dataset. Sparse outreach data
  makes those sizes representative of the demo state, not an upper bound.
- No production data, credentials, provider mutation, sending, or publishing was used.

CCX-001 is unblocked to inventory current routes and capabilities against this fixed
baseline. The recorded red gates must continue to be treated as pre-existing debt,
and CCX-001 must not silently broaden into shell, design-token, feature-redesign,
safety, publishing, authorization, storage, or data-model work.
