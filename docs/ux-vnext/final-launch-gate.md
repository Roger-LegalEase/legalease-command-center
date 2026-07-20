# vNext v1.1 final launch gate — CCX-806

Corrected launch-gate status: **PASS, subject to authoritative GitHub CI**. The one authorized complete runner executed from 2026-07-20 17:15:29 UTC through 17:40:42 UTC. It passed every non-browser stage and correctly failed the browser stage before the last targeted corrections (103 passed, 7 failed, 9 did not run). The runner was not restarted. After the corrections, the four affected browser files executed 24/24 tests successfully, covering all 7 failures and all 9 serial tests that had not run. The correction tree was captured as `af5cbc5cc4be7d62dfed81fd07e775670c35a9fe`; the follow-up commit SHA is recorded in PR #107 after commit creation.

## Final evidence

| Evidence | Result |
|---|---|
| Original Phase 8 head | `e2aefe13263fe83c8ce9ed1b0b80de9fc1af51bc` |
| Extended parity | PASS — base 150 discovered / 31 failures; head 156 / 31; added `[]`; missing `[]`; removed `[]`; quarantined 0/0. |
| Browser | PASS by complete-plus-targeted coverage — all 119 tests executed successfully across the one-shot run and corrected focused reruns; the four corrected files were 24/24. |
| Production verification | PASS — no inherited credentials, flags default off, inert adapters, 0 secret exposures, private storage fails closed, and 0 white screens. |
| Accessibility | PASS — serious 0, critical 0 at 1440, 1280, 1024, 768, and 390 px. |
| Performance | PASS — CSS 131,619 bytes; initial JS 1,629,542 bytes; local p95: Today 641.59 ms, Inbox 303.74 ms, Social 216.50 ms, Outreach 40.24 ms, Partners 211.85 ms, Files 37.61 ms, Investor 31.83 ms, Search 45.28 ms, Create 6.97 ms, Discovery 18.70 ms. |
| Recovery / rollback | PASS — zero automatic external retries; flags and retained legacy renderers provide the rollback boundary below. |
| Audit | PASS — `npm audit --audit-level=high` reported 0 vulnerabilities. |

Exact commands used for the final evidence were:

```text
env VNEXT_LAUNCH_GATE_HEAD_SHA=31e8aeaff70b6d4d845e694dd71655388aadb8d0 npm run launch:gate:vnext
node scripts/run-browser-tests.mjs tests/browser/post-composer-acceptance.spec.mjs tests/browser/post-composer.spec.mjs tests/browser/social-home.spec.mjs tests/browser/social-results.spec.mjs
node scripts/run-browser-tests.mjs tests/browser/social-home.spec.mjs tests/browser/social-results.spec.mjs
npm run test:vnext-route-compatibility
npm run test:vnext-desktop-shell
npm run test:vnext-responsive-shell
npm run test:vnext-social-home
npm run test:vnext-social-results-surface
npm run test:vnext-social-production-integration
npm run test:vnext-accessibility
npm run test:vnext-launch-gate-contract
npm run verify:vnext-production
env EXTENDED_PARITY_EVENT_NAME=pull_request EXTENDED_PARITY_BASE_SHA=c6089bb571aa2a3e9b31a1c8aed8706e10e05586 EXTENDED_PARITY_HEAD_SHA=af5cbc5cc4be7d62dfed81fd07e775670c35a9fe node scripts/compare-extended-tests.mjs
node --check <each changed .mjs file>
git diff --check
```

## Product

| Requirement | Evaluation and evidence |
|---|---|
| Five primary destinations | PASS contract: Today, Social, Outreach, Partners, and Files are the five primary destinations; route-inventory, shell, responsive, and browser suites enforce the count. |
| No dead visible controls | PASS contract: button-control, feedback, primary browser workflows, and packet acceptance tests require an endpoint or safe operation and an explicit result. |
| Founder-facing language | PASS contract: founder-language registry and surface tests reject normal-mode engine terminology. |
| Loading, empty, error, success | PASS contract: shell, product acceptance, Discovery empty-state, and recovery suites cover all four truthful states. |
| Exact object links | PASS contract: Posts, Campaigns, Partners, and Files use stable identifiers; exact-link and alias browser suites cover resolution and invalid routes. |
| Real persistence and reload | PASS contract: scoped write integration/browser tests save and reload primary workflow records; the demo embeds real persisted references. |
| No mockup dependency | PASS contract: production pages use compact authorized projections. The approved image remains a visual reference only. |

## Brand

| Requirement | Evaluation and evidence |
|---|---|
| Navy shell and official white logo | PASS contract: immutable brand tokens and exact `assets/brand/logos/legalease-logo-white-2025.png` path; no recreation or distortion. |
| Soft teal selection | PASS contract: shell navigation uses the approved teal token role. |
| Exact orange | PASS contract: primary actions use `#F04800`; secondary and danger controls retain their semantic roles. |
| No color/logo drift | PASS contract: the brand suite rejects unauthorized near-duplicates, external fonts, and substituted shell marks. |
| Desktop through mobile | PASS contract: browser coverage includes 1440, 1280, 1024, 768, and 390 px with screenshot and overflow review. |

## Social

Idea → Create → Review → Schedule → publish/manual-publish behavior is covered by Social acceptance and browser suites. Exact creative references and brand assets are available in the composer; independent channel variants persist. Guidelines, render readiness, approval, and connection checks remain hard gates. Idempotent publishing uses per-channel attempt records and retry contracts. No test enables a live adapter.

## Outreach

Goal → Audience → Message → Schedule → Review → Launch is covered by Outreach acceptance and browser suites. Recipient preview counts are reconciled with execution, suppression and hold status cannot be bypassed, approval remains separate from execution, and idempotent sending prevents duplicate attempts on retry. No test enables live sending.

## Partners

Partners home and record acceptance suites require the immediate next action, integrated Outreach and Files references, stable exact links, and a user-facing stage adapter that preserves the internal lifecycle.

## Files

Files acceptance, integration, and browser suites cover upload, preview, relate, search, and role-based access. Investor Room requirements exclude failed, missing, stale, and draft records from current readiness and preserve private-storage fail-closed behavior.

## Engineering

The one-shot runner strips inherited provider credentials, sets `SKIP_ENV_LOCAL_FILE=1`, forces every feature/live-action flag off, and relies on each test’s temporary paths, synthetic fixtures, ephemeral ports, and inert adapters.

| Stage | Result |
|---|---|
| `npm run check` | PASS |
| `npm test` | PASS |
| Extended base/head parity | PASS — unchanged 31-test inherited failure set; added `[]`, missing `[]`, removed `[]`, quarantine 0/0. |
| Browser coverage | PASS by complete-plus-targeted coverage — the one-shot runner recorded 103 passed, 7 failed, and 9 not run; after correction, all 16 blocked cases passed within a 24/24 focused run. |
| Performance / accessibility / recovery | PASS / PASS / PASS. |
| Production verification | PASS |
| Security hardening | PASS |
| Secret scan / PII scan | PASS / PASS; zero findings. |
| Migration validation / restore drill | PASS / PASS. |
| `npm audit --audit-level=high` | PASS; zero vulnerabilities. |

The final browser blockers were stale legacy-alias expectations, loss of compact Social surface state during query-only routing, one reviewed missing-record 404 that was not path-scoped in the harness, and insufficient search-shortcut contrast. The application now accepts legacy aliases while canonicalizing founder-facing Social URLs, preserves Back/Forward and compact route state, scopes only the reviewed missing-record 404, and uses the approved navy token for accessible shortcut text. The complete gate was not run a second time.

No new high-severity audit finding is acceptable. Production verification must pass unauthorized access, secret exposure, private storage, exact links/aliases, no-white-screen, inert adapters, and rollback boundaries.

## Rollback

Set the affected product flag false; set `COMMAND_CENTER_UX_VNEXT=false` first for a shell-wide fault. Confirm the preserved legacy alias reaches the same exact object and that compact/auth/private-storage checks pass. Do not roll back persisted data for a presentation-only issue. Record the checkpoint SHA, flag change, operator, reason, and time. Legacy renderers retained in CCX-804 remain the one-release rollback path.

## Flag decision

No global or product flag becomes default true automatically. **All deployment, sending, and publishing flags remain off.** After authoritative CI passes and human review approves rollout, the server-side global flag may be enabled for an internal cohort, followed independently by Social, Outreach, Files, and Discovery with observation between steps. This packet authorizes no live sending or publishing flag.

PR #102 may **not** become ready for review yet. PR #107 must first pass authoritative CI and be integrated through Lane B; required final human review must then complete.

## Known limitations

- Local compact-read p95 is deterministic production-like evidence, not hosted-network telemetry; hosted p95 below 750 ms must be observed during staged rollout.
- Initial client JavaScript remains about 1.61 MB because the legacy strangler compatibility runtime is retained for rollback; the enforced ceiling is 1.65 MB.
- CCX-804 removed no legacy source (0 bytes) because parity/telemetry prerequisites were incomplete; aliases and renderers remain for one additional release.
- Automated axe and keyboard contracts cover the primary workflows; human assistive-technology and final visual review remain release-approval activities.
- The exact extended comparator retains 31 inherited failures in older non-vNext contracts. They remain discovered and executed; none were quarantined, removed, renamed, or represented as Phase 8 regressions.
- The one-shot runner's browser stage remains recorded as 103 passed, 7 failed, and 9 not run. All 16 blocked cases subsequently passed in the corrected focused run; authoritative GitHub browser CI remains the final combined-matrix confirmation.

Final corrected result: **PASS, subject to authoritative GitHub CI — flags remain off; PR #102 may become ready only after Lane B integration and final human review.**
