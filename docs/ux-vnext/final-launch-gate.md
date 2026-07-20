# vNext v1.1 final launch gate — CCX-806

Local gate status: **FAIL**. The one required complete run executed from 2026-07-20 14:12:04 UTC through 14:30:29 UTC. Nine of eleven stages passed; `npm run test:extended` and the full browser suite failed. GitHub CI remains authoritative after the packet is pushed, but a local failure cannot be represented as a pass.

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
| `npm run test:extended` | FAIL — 125/156 passed; all vNext Phase 8 and product acceptance contracts passed, but 31 older tests failed against the current release baseline. |
| Full browser suite | FAIL — 115/119 passed in the one-shot run. |
| Production verification | PASS |
| Security hardening | PASS |
| Secret scan / PII scan | PASS / PASS; zero findings. |
| Migration validation / restore drill | PASS / PASS. |
| `npm audit --audit-level=high` | PASS; zero vulnerabilities. |

The four browser failures exposed a missing `#social` compatibility target, outdated recovery selectors/expected browser errors, an ambiguous focus assertion, a serious Discovery eyebrow contrast issue, and test timeout/cleanup limits. Those defects were fixed. Focused reruns then passed production verification (2/2), reliability recovery (2/2), and the complete accessibility audit (2/2 across seven primary workflows and five widths). Per the train instruction, the complete gate was not run a second time.

No new high-severity audit finding is acceptable. Production verification must pass unauthorized access, secret exposure, private storage, exact links/aliases, no-white-screen, inert adapters, and rollback boundaries.

## Rollback

Set the affected product flag false; set `COMMAND_CENTER_UX_VNEXT=false` first for a shell-wide fault. Confirm the preserved legacy alias reaches the same exact object and that compact/auth/private-storage checks pass. Do not roll back persisted data for a presentation-only issue. Record the checkpoint SHA, flag change, operator, reason, and time. Legacy renderers retained in CCX-804 remain the one-release rollback path.

## Flag decision

No global or product flag becomes default true automatically. Because the complete local gate is FAIL, **no deployment flag is currently eligible to be enabled**, even after human approval. After the extended baseline is resolved, authoritative CI passes, and human review approves rollout, the server-side global flag may be enabled for an internal cohort, followed independently by Social, Outreach, Files, and Discovery with observation between steps. This packet authorizes **no** live sending or publishing flag.

PR #102 may **not** become ready for review yet. This train’s draft PR must be green and incorporated into its release branch, the 31-test extended baseline must be resolved or proven green by the authoritative matrix, required human review must complete, and the final gate must be re-evaluated as PASS in a separately authorized follow-up.

## Known limitations

- Local compact-read p95 is deterministic production-like evidence, not hosted-network telemetry; hosted p95 below 750 ms must be observed during staged rollout.
- Initial client JavaScript remains about 1.61 MB because the legacy strangler compatibility runtime is retained for rollback; the enforced ceiling is 1.65 MB.
- CCX-804 removed no legacy source (0 bytes) because parity/telemetry prerequisites were incomplete; aliases and renderers remain for one additional release.
- Automated axe and keyboard contracts cover the primary workflows; human assistive-technology and final visual review remain release-approval activities.
- The complete local extended stage has 31 failures in older non-vNext contracts (legacy surfaces, connector/readiness callbacks, durable-storage/public-page assertions, and stale source-shape checks). They were not quarantined or weakened in this packet.
- The one-shot full browser result remains 115/119 even though all four affected tests passed after focused fixes; the train explicitly allowed the complete local gate to run only once.

Final result: **FAIL — PR #102 may not become ready for review; no deployment flag may be enabled.**
