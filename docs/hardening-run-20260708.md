# Hardening Run: Ground-Truth Re-Verification (2026-07-08)

Re-verification of `docs/command-center-ground-truth-audit.md` (dated 2026-07-02) against main at
`e51297d` and live production, before any new slice work. Method: git history review, clean-worktree
gate run, targeted greps per finding, and read-only prod probes (GET only, owner token from env,
never echoed).

**Context that changed since the audit was written:** PRs #17 through #33 merged, including the
entire Phase 18 plan (18B through 18I, PRs #18 to #25), the cockpit redesign (#17), reactivation
live mode (#29), CI (#31), the scoped-write hardening (#30), and the contact-shredding fix (#33).
Production was promoted to the exact main tip today. A separate live-ops incident (contact-record
shredding and its full recovery) was root-caused and fixed earlier today; see the memory record and
PR #30 / #33 descriptions.

## Gate evidence

- Clean-worktree `npm run check` + `npm test` at `origin/main` (e51297d): **PASS, exit 0** (this run).
- CI (GitHub Actions `test` workflow): green on the e51297d push.
- Prod probes (read-only, this run):
  - `GET /api/version`: commit `e51297d441c4` = local main tip. **Production is current.** `deployedAt: unknown` (pre-existing cosmetic gap).
  - `GET /api/health/supabase`: connected, `writeHealth.lastWriteOkAt` fresh, `failedWriteCount: 0`.
  - `GET /api/reactivation/status`: campaign active and sending (owner decision earlier today), threshold and telemetry blocks present and honest.

## Finding-by-finding disposition

| # | Audit finding (2026-07-02) | Disposition (2026-07-08) | Evidence |
|---|---|---|---|
| 1 | Prod stale deploy breaking all full-state writes | **ALREADY FIXED** | Prod commit = main tip (probe above); write path serialized + scoped since PR #30; writeHealth clean |
| 2 | Hardcoded posture strings ("Email sending: Off" at 4+ sites) | **MOSTLY FIXED; residual CONFIRMED STILL OPEN** | `scripts/safety-posture.mjs` now derives true gate state and `emailPostureLabel()` is used live. Residual literals: `preview-server.mjs:28442` (RCAP status line hardcodes "Outreach automation: Off · External actions: Off · Email open/click tracking: Off · Page tracking: Off · Calendar writes: Off") and `preview-server.mjs:29984` (More-page demo table row) |
| 3 | Dead code `settingsHealthReadoutHtml` | **ALREADY FIXED** | Zero references in the repo (grep) |
| 4 | 34 toast-only fake buttons | **ALREADY FIXED (spot-check advised)** | Fixed in the cockpit redesign per merged PRs. A heuristic scan (client functions calling toast with no fetch) now finds only legitimate local-UI actions (dialog cancels, clipboard copy, snooze) and the deliberate `safeControlToast` inert-control messenger. No confirmed fake control found; a manual UI spot-check during the next UI slice is cheap insurance |
| 5 | Queue dead-end (Today points at a Queue page that cannot render approvals) | **ALREADY FIXED** | Phase 18B (PR #18): Decisions page at `preview-server.mjs:26312`, `GET /api/queue`, `loadDecisionsQueue()`, Open control on Needs Roger cards. Social Review Desk at `#queue` untouched, per plan |
| 6 | More page hardcoded demo content (Activation Center, External Action Outbox, Social Accounts) | **CONFIRMED STILL OPEN** | Static cards at `preview-server.mjs:30055, 30067, 30077` plus hardcoded example table rows at `29974-29984`. Copy is honest in tone ("Not connected", "Draft-only") but the content is static, not derived |
| 7 | Unwired route `/api/rcap-revenue/preview` | **CONFIRMED STILL OPEN** | `previewRcapRevenueWorkbook` exported at `rcap-revenue-os.mjs:320`; zero references in `preview-server.mjs` |
| 8 | Full-state write: autopilot toggle | **ALREADY FIXED** | PR #30: serialized + scoped (`preview-server.mjs` ~35240, comment cites the fix); regression-tested in `test-scoped-write-hardening.mjs` |
| 9 | Full-state write: unsubscribe handler | **CONFIRMED STILL OPEN** | The outreach unsubscribe branch (`preview-server.mjs` ~35279) still calls `store.writeState(nextState)` on a PUBLIC, unauthenticated endpoint: the exact bot-reachable full-state shape PR #30 eliminated elsewhere. A second nearby branch already uses scoped `writeCollections`, so the fix pattern is local |
| 10 | Registration hygiene: scripts missing from `npm run check`; orphaned test files | **CONFIRMED PARTIALLY OPEN** | 151 of 232 `scripts/*.mjs` in the check chain; 94 of 153 `test-*.mjs` in the test chain (59 orphaned). Counts include some intentional CLI/one-off scripts; the slice should classify before adding |
| 11 | `test-soc2-export` blocking the front of the test chain | **ALREADY FIXED** | Now last in the chain; CI's clean env passes the full chain |
| 12 | No CI | **ALREADY FIXED** | PR #31: check + test on every PR and push to main |
| 13 | No deploy-behind detection | **ALREADY FIXED** | `GET /api/version/drift` (`preview-server.mjs:33983`), boot fetch, Today badge with plain-English headline ("Deploy status unverified..." / severity tones) |
| 14 | Webhook signature verification, webhook health telemetry, scoped webhook writes, `wave_released_at` bug | **ALREADY FIXED** | Phase 0 trust PR (merged); signature enforcement verified live 2026-07-03; webhook health block observed live today during the campaign incident |
| 15 | Campaign control terminal-only; Campaigns page one-row-per-contact | **ALREADY FIXED** | M2 campaign command (#15/#16): propose, Queue-approve, execute; wave-release preview/propose/execute routes; PR #29 owner Run/Stop live-mode switch; 18E lane views. Campaigns page now renders `campaignsControlPageHtml` (wave-grouped controls, not contact rows) |
| 16 | No unified Queue / Contact / timeline / approvals / agent-runs view | **ALREADY FIXED (foundation)** | Phase 1 company memory (PR #12): QueueItem/Contact/Org/Event/AgentRun/Approval + projector; 18B Decisions; 18C agent runs + autonomy registry (PR #19) |
| 17 | Phases 18D through 18I | **ALREADY FIXED (all merged)** | PRs #20 (18D), #21 (18E), #22 (18F), #23 (18G), #24 (18I alerts), #25 (18H briefs); post-merge hardening #26, #27, #28 |

## New confirmed gaps not in the 2026-07-02 audit

| Item | Status | Notes |
|---|---|---|
| ~60 remaining full-state `writeState` sites (operator-action paths) | OPEN, inventoried in PR #30's description | Slice 4 scope beyond the unsubscribe handler; public/unauthenticated paths first |
| SendGrid click/open under-recording from the pre-fix era | PARTIALLY RECONCILED | Delivery and bounce records fully reconciled today; click flags need Roger's SendGrid click export (Roger action below) |
| `deployedAt: unknown` on `/api/version` | OPEN (cosmetic) | Could stamp at boot from Render env; harmless, low priority |
| Build-plan refresh doc | OPEN (docs only) | The refreshed `COMMAND_CENTER_BUILD_PLAN.md` sits on unmerged branch `command-center-build-plan-refresh` (1cafafd); main carries the older revision |

## Confirmed work plan (only CONFIRMED items proceed)

| Slice | Content | Maps to mission slice |
|---|---|---|
| 1 | Kill residual posture literals (`preview-server.mjs:28442`, `29984`); replace More-page static demo cards/rows with derived or honest-zero content; add a test asserting no posture literal renders un-derived | Slice 1 (residuals only) |
| 2 | SKIPPED: version truth already built and surfaced | Slice 2 |
| 3 | Registration hygiene: classify + add unchecked scripts to `npm run check`; fold orphaned tests into the chain or `test:extended`; wire `/api/rcap-revenue/preview` (owner/admin, read-only, no import side effect) | Slice 3 |
| 4 | Scope the outreach unsubscribe write (public endpoint, highest exposure); then sweep the remaining full-state sites in priority order (public > cron > operator) with regression tests | Slice 4 |
| 5-6, 8 | SKIPPED: 18B, 18C, 18D-18I all merged | Slices 5, 6, 8 |
| 7 | SKIPPED as built (status + preview + approval-flow controls exist); optional UI spot-check of wave lanes and the fake-button question rides along with Slice 1's UI pass | Slice 7 |

## Run log

- **Slice 4a SHIPPED AND MERGED** (PR #34, main `2ebf765`): public unsubscribe handler serialized + scoped to its three collections; the last internet-facing full-state write is gone. Suite grew 9 to 12 checks; clean-worktree gate exit 0; CI green.
- **Slice 1 SHIPPED** (this branch): residual posture literals killed. "Outreach automation" and "Publishing" status rows now derive from `/api/safety/posture` via new client helpers (`outreachAutomationLabel`, `publishingPostureRow`, `publishingPill`) with Unverified fallbacks, matching the email/social pattern. The External Action Outbox's fabricated sample records (a "Posted" LinkedIn post that never existed, a fake email draft) are replaced with an honest-zero statement; the outbox itself stays unbuilt per Phase 14 deferral. Activation Center and Social Accounts statuses derive from real `socialAccounts` signals instead of slash-separated every-possible-status strings. New `test-display-truth.mjs` (5 checks) pins all of it and is registered in both chains. Manual button spot-check of all 24 toast-calling client functions: all legitimate (local actions, clipboard, guards, wrappers, or delegating to real mutations); two borderline-but-honest informational cases noted (`runSystemCheck`, `fixCampaignImportIssues`); no fake Connect/Test controls remain.
- **Slice 4 tiers SHIPPED AND MERGED**: tier 1 public writes (PR #36), tier 2a operator-path writes (PR #37), tier 3 heartbeat tick + reactivation CLIs (PR #38, diff-scoped closing tick write with unconditional lease release). Route-level sweep complete: the only `writeState` calls left in preview-server are the documented fallback inside `writeChangedCollections` and the deliberately-serialized full write in `/api/publishing/run`.
- **Slice 4 registration backlog SHIPPED** (this branch): 24 written-but-unregistered collections added to `coreStateCollections` — the JsonStore convenience-method collections (library, brandAssets, brandRules, generationProfiles, publishEvents, postImages), all ten unregistered `growthCollections` members (milestones, complianceItems, the full soc2 family incl. soc2ControlOwners + soc2TypeIChecklist, which the notes list had missed), and eight direct route/engine writes (campaignKits, emailDrafts, externalActionOutbox, generationBatches, syncRuns, googleInsights, dailyRunPublisherRuns, handoffContractPreviews). Every one previously had its Supabase writes silently dropped. postImages payloads are now compacted on the Supabase row path (data: URIs stripped) matching the local-file path, so registration cannot push base64 image rows. All writers verified to stamp stable per-item ids (no index-fallback shredding). assetBundles deliberately excluded: seed/read-only, no write site. New `test-registration-backlog.mjs` (5 checks) pins membership, growthCollections ⊆ registry, compaction, stable keys, and the exclusion; registered in both chains.
- **New Slice 3 datum:** `test-founder-language-and-clutter.mjs` (orphaned, not in the chain) is red on unmodified main; its page-structure greps went stale during the cockpit redesign. Slice 3 must triage orphaned tests as fix / retire, not blind-add them to the chain.
- Structural design statements ("Calendar writes: Off", "External actions: Off", read-only Gmail descriptors, and the sentence-form "this never sends" contract lines on draft workflows) were deliberately left: they describe capabilities that do not exist rather than gates that could flip. The ~20 decorative "Publishing is off" reassurance badges on internal ritual pages are catalogued as a follow-up decision: replace with `publishingPill()` in a mechanical pass, or accept as design-contract reminders.

## ROGER-ONLY ACTIONS (none block the slices above)

1. **SendGrid click export** (optional, improves cadence honesty): Activity feed, filter Clicked, export, hand over the file. I reconcile clicked flags so engaged readers pause correctly.
2. **Campaign policy follow-ups from today's live incident** (separate workstream, already in your court): list verification service decision; walking the hard-bounce threshold back down from 6% after wave 2; alerts activation (`ALERTS_EMAIL_TO` + `ALERTS_LIVE_SEND` in Render + the switch on the Alerts page) so threshold trips email you.
3. **Merge decision on the build-plan refresh branch** (`command-center-build-plan-refresh`): docs-only, brings the system map current.

No Render promote is needed: production already runs the main tip.
