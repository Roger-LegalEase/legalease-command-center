# 01 — Current-State Reuse Ledger

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

Every row was verified against `a3793c3`. **Production trust** cites a focused test or is
marked honestly: **Verified** = focused test in the strict `npm test` gate; **Partially
verified** = focused test exists but only in the extended differential runner (see
`evidence/loose-ends.md` §3), or the test covers part of the claimed behavior;
**Unverified** = no focused test proves the claimed behavior. A module's existence is
never treated as readiness.

Rows marked DECIDED come from the consolidation outline. Rows marked PROPOSED were
surfaced by the regenerated evidence and are for Roger to ratify.

---

## DECIDED rows

### 1. Task engine — **Keep** → Today action panel
- **Source:** `scripts/tasks-engine.mjs` (statuses open/in_progress/waiting/blocked/done/archived; `deriveAutomaticTasks`, `updateTaskInState`); orchestration in `scripts/preview-server.mjs` (~`:2623`, `:2636`).
- **Routes:** `POST /api/tasks/rebuild` (`preview-server.mjs:39546`), `POST /api/tasks/:id/:action` (`:39556`).
- **Collections:** `tasks`; side-writes `auditHistory`, `activityEvents`, `evidencePackNotes`.
- **Permissions:** write requires owner/admin/operator (viewer denied) via `authorizeRequest`.
- **Gates:** blocked status requires a blocker reason; internal-only actions; versioned mutation guard.
- **Trust:** **Verified** — `test-tasks-engine.mjs` (strict gate); `test-tasks-priorities.mjs` extended-only.
- **Migration:** none — same collection. **Replacement:** worked through the universal action panel in Today. **Retire condition:** standalone task pages retire when the panel covers every task action (`08_DELIVERY_PLAN.md` Release 2 parity).

### 2. Task workbench drawer — **Consolidate** → universal work-item panel
- **Source:** `scripts/task-workbench-service.mjs` (`buildTaskWorkbenchView`, `applyTaskWorkbenchAction`, 12 KB body limit); `assets/ui/task-workbench.css`; handlers `preview-server.mjs:36346–36384`.
- **Routes:** `GET /api/ui/tasks/:id`, `POST /api/ui/tasks/:id/action`.
- **Collections:** reads `TASK_WORKBENCH_READ_COLLECTIONS`; writes only `tasks`, `auditHistory`, `activityEvents`.
- **Permissions:** vNext flag + session; actions require `manage_tasks` capability.
- **Gates:** blocked requires `blockerReason`, waiting requires `waitingOn`, snooze limited to {1,3,7,14,30} days, optimistic version check (409 on conflict).
- **Trust:** **Verified** — `test-vnext-task-workbench.mjs`.
- **Migration:** none. **Replacement:** this drawer is the seed of the universal action panel — extended to emails, approvals, support, exceptions. **Retire condition:** never retired; it becomes the panel.

### 3. Legacy cockpit task buttons (toast-only) — **Remove or replace** → Today
- **Source:** `scripts/preview-server.mjs:24141–24144` (Top 3: Edit Priority / Mark Done / Move to Tomorrow), `:24171` (Needs Attention Mark Done), `:24190–24192` (Resolve Blocker / Move to Tomorrow), `:20034–20036` (guided-queue judgment mode), `:19941–19942` (RCAP task card actions). All `toast(...)`-only; no API call, no mutation.
- **Contrast:** the real path exists — `markTaskDone` → `POST /api/tasks/:id/done` (`:34033`, `:22715–22723`).
- **Trust:** **Unverified** as product behavior — no test asserts these buttons work, because they don't; `evidence/loose-ends.md` proves they are no-ops.
- **Migration:** none. **Replacement:** task-workbench actions wired to the real task API. **Retire condition:** hidden immediately in Release 1 (a button that lies about completing work fails the charter's experience standard); replaced in Release 2.

### 4. Partner records — **Keep** → Relationships
- **Source:** `scripts/partner-api-integration.mjs` (scoped-write allowlists), `scripts/partners-home-service.mjs`, `scripts/partner-record-actions.mjs`, `partner-program-engine.mjs`, `partner-lifecycle.mjs`, `partner-artifact-service.mjs`; CSS `assets/ui/partners-home.css`.
- **Routes:** `GET/POST` under `/api/ui/partners` (record, outreach, files, activity, next-action, next-action/complete, outreach/selection).
- **Collections:** `partners`, `partnerPrograms`, `partnerProgramArtifacts`; reads `pilots`, `campaigns`, `automationEvents`, `dataRoomItems`.
- **Permissions:** session-gated; `recordVisibleToActor` role filtering.
- **Gates:** scoped-write allowlist (unexpected collection change throws), query field allowlisting.
- **Trust:** **Verified** — `test-vnext-partner-record.mjs`, `test-vnext-partners-home.mjs` (strict gate); `test-partners-workspace.mjs` extended-only.
- **Migration:** none for partner data; Relationships projects on top. **Replacement:** Relationships workspace. **Retire condition:** partner-* routes alias into Relationships after Release 3 parity.

### 5. Company contacts and outreach contacts as separate identity sources — **Project and deduplicate** → Relationships
- **Current reality (verified):** **seven** separate identity stores, each module-owned: `outreachContacts`/`outreachOrganizations` (`scripts/outreach-os.mjs`), `reactivationContacts` (`scripts/reactivation-os.mjs`), `companyContacts`/`companyOrganizations` (`scripts/company-memory.mjs` + projector), `rcapRevenueContacts` (`scripts/rcap-revenue-os.mjs`), `expungementLifecycleContacts` (`scripts/expungement-lifecycle-sync.mjs`), `prospectCandidates` (`scripts/prospect-discovery.mjs`), `partners` (partner modules).
- **Dedup key already exists:** `companyContactId` = one contact per normalized email (`company-memory.mjs:324`) — the projection extends this, no new store.
- **Trust:** **Verified** per lane (`test-company-memory.mjs`, `test-outreach-os.mjs`, `test-reactivation-dedupe.mjs`, `test-expungement-lifecycle-sync.mjs` extended-only, `test-rcap-revenue-os-foundation.mjs`).
- **Migration:** projection only — **no destructive merge of source collections**; campaign lanes keep their own stores (safety machinery depends on them). **Replacement:** unified CRM view per `workspaces/relationships.md`. **Retire condition:** `contacts` route retires when the CRM view covers list/browse at Release 3 parity.

### 6. Communication composer (Gmail handoff + mark-sent) — **Keep and expose consistently** → Today and Relationships
- **Source:** `scripts/communication-composer-api.mjs`, `scripts/communication-composer-service.mjs` (`buildGmailComposeUrl:497`, `markCommunicationDraftSentManually:~874`); CSS `assets/ui/communication-composer*.css`.
- **Routes:** `GET /api/ui/communications/context`, `POST /api/ui/communications/drafts`, `POST /api/ui/communications/drafts/:id/manual-sent`.
- **Collections on mark-sent:** `emailDrafts`, `partners`, `companyContacts`, `outreachContacts`, `reactivationContacts`, `prospectCandidates`, `approvalQueue`, `inboxSignals`, `supportIssues`, `outreachReplies`, `tasks`, `activityEvents`, `auditHistory` — it already performs the charter's cascade: records the interaction, updates the relationship, flags queued automation for review, resolves the source item, optionally completes the originating task.
- **Permissions:** session-gated; `recordVisibleToActor`.
- **Gates:** no send path (`externalActions: 0`); suppression blocks the Gmail URL for unsubscribed/bounced/complained recipients; `requestId` idempotency (duplicate mark-sent → 409); input allowlist.
- **Trust:** **Partially verified** — `test-communication-composer-service.mjs` exists but is extended-only.
- **Migration:** none. **Replacement:** the drafting surface inside the universal action panel. **Retire condition:** n/a — it is the foundation; exposure widens.

### 7. Social post composer with channel variants — **Keep** → Campaigns Social
- **Source:** `scripts/post-composer-service.mjs`, `scripts/ui/view-models/post-channel-variants.mjs`, `post-publishing-controls.mjs`.
- **Routes:** `GET /api/ui/social/post/:id/composer`, `POST /api/ui/social/post/:id/save`, production actions `/api/ui/social/post/:id/{creative|render|variants|schedule|approve|request-changes|regenerate|publish|manual-package}`.
- **Collections:** reads composer read-set; writes `posts` (+ `postImages`, `publishEvents`, `generationBatches` in production actions).
- **Permissions:** social vNext flag + `canPerformEndpoint` role checks.
- **Gates:** `productionEnabled` + draft version + eligibility; `socialGuidelinesGate` on approve/schedule.
- **Trust:** **Verified** — `test-vnext-post-composer-draft.mjs`, `test-vnext-post-composer-workspace.mjs`, `test-vnext-post-channel-variants.mjs`.
- **Migration:** none. **Replacement:** the Create/edit step of the Social lane. **Retire condition:** n/a — reused in place.

### 8. Social live-publishing pipeline (per-channel OAuth, scheduled publisher, Publish Now) — **Advanced only, dormant behind existing env gates**
- **Source:** `scripts/channel-connectors.mjs` (LinkedIn/Meta OAuth); OAuth callbacks `preview-server.mjs:8508–8556` (owner-started signed state); scheduled publisher `runPublishingWorker`/`publishDueScheduledPosts` (`:5661`, channels linkedin+x); Publish Now `publishPostNow` (`:5801`) ← `POST /api/posts/:id/publish-now` (`:41323`).
- **Env gates (all default off):** `LINKEDIN_LIVE_POSTING_ENABLED`/`ENABLE_LIVE_LINKEDIN_POSTING`, `ENABLE_LIVE_X_POSTING`/`ENABLE_LIVE_TWITTER_POSTING`, `ENABLE_LIVE_FACEBOOK_POSTING`, `ENABLE_LIVE_INSTAGRAM_POSTING`, `ENABLE_LIVE_THREADS_POSTING` (`livePostingEnvKeys`, `:694`).
- **Collections:** `posts`, `publishEvents`, `publishClaims` (append-only), `socialAccounts`, `dailyRunPublisherRuns`.
- **Gates:** live gate on the scheduled path, `publishReadiness`, publish claims. *(2026-07-23: the manual Publish Now live-gate gap is closed by PR #113 — `publishPostNow` now enforces the per-channel gate; the route itself is 403'd unconditionally by the endpoint-hardening layer. See `evidence/publish-now-gate-review.md` dated update.)*
- **Decision (charter):** manual posting is the product. This pipeline is **Advanced only** and stays dormant; it is not deleted.
- **Production trust:** **Partially verified** — `test-social-publish-claims.mjs` and `test-publish-now-live-gate.mjs` (PR #113) prove the claim and gate behavior; `test-social-posting-safety.mjs` and the OAuth suites are extended-only and stale. **Blocker before any future activation: the scheduled-publishing test must pass on the supported authentication path** (static-token API auth was removed in PR #110; the repair is in the test-fixes PR, pending merge).
- **Migration:** none. **Replacement:** none (dormant). **Retire condition:** n/a; activation requires the audit-fixes PR first (`08_DELIVERY_PLAN.md` preconditions).

### 9. Reactivation engine (SendGrid, waves, suppression, claims, thresholds) — **Keep unchanged** → Campaigns Reactivation
- **Source:** `scripts/reactivation-os.mjs`, `scripts/reactivation-sequences.mjs`, suppression/compliance primitives reused from `scripts/outreach-os.mjs`, executor `runReactivationSend` (`preview-server.mjs:~5475`), `scripts/sendgrid-webhook.mjs`; CLI ops scripts (`reactivation-import.mjs`, `reactivation-release-wave.mjs`, …).
- **Routes:** `GET /api/reactivation/status`, `POST /api/reactivation/live-mode` (owner/admin), `/api/campaign/*` controls, shared webhook + HMAC unsubscribe routes.
- **Collections:** `reactivationContacts`, `reactivationAttempts`, `reactivationEvents`, `reactivationCampaign` (singleton), `reactivationSendClaims` (append-only).
- **Gates:** four independent layers (live-mode authority + kill switch; autopilot toggle; wave release; threshold auto-pause) plus claims, suppression, window, caps — `evidence/safety-gates.md`.
- **Trust:** **Verified** — `test-reactivation-os.mjs`, `test-reactivation-claims.mjs`, `test-reactivation-live-mode.mjs`, `test-reactivation-dedupe.mjs`, `test-sendgrid-webhook.mjs`.
- **Migration:** none — **the engine is not touched**. **Replacement:** simplified control surface reads/writes through existing functions only. **Retire condition:** n/a.

### 10. Partner outreach (sequences, approvals, replies, claims) — **Keep** → Campaigns Partner outreach
- **Source:** `scripts/outreach-os.mjs`, `scripts/outreach-sequences.mjs` (fail-closed sequence router), `scripts/outreach-classifications.mjs`, `scripts/outreach-home-service.mjs`, executor `runOutreachSend` (`preview-server.mjs:~5433`).
- **Routes:** `POST /api/outreach/approve` (`:38404`), `POST /api/outreach/config` (admin, `:38458`), `GET /api/outreach/status`, webhook + unsubscribe, `/api/approvals/decide`.
- **Collections:** the 12 `outreach*` collections incl. `outreachConfig` (singleton), `outreachSendClaims` (append-only).
- **Gates:** queue-then-approve (code can never write `approved`), `OUTREACH_LIVE_SEND` default-off, claims, suppression, caps, window, CAN-SPAM.
- **Trust:** **Verified** — `test-outreach-os.mjs`, `test-outreach-claims.mjs` (strict gate); `test-outreach-sequences.mjs` extended-only.
- **Migration:** none. **Replacement:** Campaigns Partner outreach lane over existing routes. **Retire condition:** n/a.

### 11. Automation Control review-only projection — **Replace as primary interface** → Campaigns
- **Source:** `scripts/automation-control-center-service.mjs` (frozen `AUTOMATION_REVIEW_POSTURE`: reviewOnly, no mutations, no sends, zero provider calls; lanes Reactivation / Partner prospect outreach / Press outreach), `scripts/automation-control-center-api.mjs`, `scripts/ui/pages/automation-control-center.mjs`.
- **Routes:** `GET /api/ui/automation-control-center`.
- **Collections:** 19-collection targeted read set; no write path.
- **Trust:** **Partially verified** — `test-automation-control-center-api.mjs`/`-ui.mjs`, `test-vnext-automation-control-center.mjs` all extended-only.
- **Migration:** none. **Replacement:** the Campaigns workspace becomes the primary interface; this projection's read models are reused inside it. **Retire condition:** page retires when Campaigns lanes show the same posture data (Release 4).

### 12. Campaign command page (real Reactivation controls) — **Reuse behind simplified interface** → Campaigns Reactivation
- **Source:** `scripts/campaign-command.mjs` (delegates all authority to `reactivation-os.mjs`; EXECUTE requires a matching approved Approval), `scripts/campaign-brain.mjs`; client UI `preview-server.mjs:18407–18611`.
- **Routes:** `GET /api/campaign/command`, `GET /api/campaign/brain`, `POST /api/campaign/wave-release/{preview|propose|execute}`, `POST /api/campaign/pause`, `POST /api/campaign/resume/{propose|execute}`, `POST /api/campaign/held-release/confirm`; mutations owner/admin.
- **Collections:** reads full state today (legacy `readState()` — migrates to targeted reads when wrapped); writes `approvals`/`approvalQueue` + `reactivationCampaign` via scoped writes.
- **Trust:** **Verified** — `test-campaign-command.mjs`.
- **Migration:** none. **Replacement:** the founder Reactivation control surface calls these routes; internal jargon translated per `workspaces/campaigns.md`. **Retire condition:** `#campaigns` page folds in at Release 4 parity.

### 13. Le-E — **Keep and make contextual** → global side panel
- **Source:** `scripts/lee-assistant.mjs` (propose-only: "You propose; Roger disposes"; PII scrub; voice checks; OpenAI-only caller, degrades without key), `runLeeChat` (`preview-server.mjs:2719`), `scripts/lee-inbox-api.mjs`/`lee-inbox-service.mjs`.
- **Routes:** `GET /api/lee/status`, `GET /api/lee/threads`, `POST /api/lee/chat` (owner/admin only), `GET/POST /api/ui/lee-inbox[/action]`.
- **Collections:** `leeThreads`, `leeMessages`, `leeRuns`, proposals into `automationSuggestions` (approve-then-apply I4 flow); legacy `leeActionProposals` migrates one-way.
- **Gates:** propose-only — no direct-write/execute path; suggestions require human approval.
- **Trust:** **Verified** — `test-lee-assistant.mjs` (strict gate); lee-inbox suites extended-only.
- **Migration:** none. **Replacement:** side panel available from every workspace (Release 6); the no-confirmation internal-action list requires extending the I4 apply flow — marked NEW in `08_DELIVERY_PLAN.md`. **Retire condition:** `#lee` page retires at panel parity.

### 14. Founder Scoreboard — **Consolidate** → Scoreboard
- **Source:** `scripts/founder-scoreboard-service.mjs` (21-collection frozen read set, `SCOREBOARD_STATUSES` live/manual/unavailable/needs_attention), `scripts/founder-scoreboard-api.mjs`; CSS `assets/ui/founder-scoreboard.css`.
- **Routes:** `GET /api/ui/scoreboard`, `POST /api/ui/scoreboard/finance` (owner-entered cash/runway → `runwayInputs`).
- **Permissions:** authenticated + `read_internal` capability (viewer excluded).
- **Trust:** **Partially verified** — `test-scoreboard-wiring.mjs` in strict gate; `test-founder-scoreboard-{service,api,ui}.mjs` extended-only.
- **Migration:** none. **Replacement:** the Scoreboard workspace per `workspaces/scoreboard.md`. **Retire condition:** legacy `proof`/`metrics`/`revenue` pages retire at Release 5 parity.

### 15. Company Health — **Move into Scoreboard**
- **Source:** `scripts/founder-company-health-service.mjs` + `-api.mjs`, `scripts/ui/pages/founder-company-health.mjs`.
- **Routes:** `GET /api/ui/company-health[?advanced=true]`.
- **Collections (targeted, read-only):** `connectorStatus`, `funnelSnapshots`, `heartbeatRuns`, `osHealthSnapshots`, `sendgridWebhookHealth`, `socialAccounts`, `systemHealth`.
- **Trust:** **Partially verified** — `test-founder-company-health-{service,api,ui}.mjs` extended-only.
- **Migration:** none. **Replacement:** Scoreboard Platform health section; exceptions project to Today. **Retire condition:** `os-health` page retires at Release 5 parity.

### 16. Heartbeat — **Keep invisible** — campaign status infrastructure
- **Source:** `scripts/heartbeat.mjs` (`autopilotEnabled` default OFF per engine), `scripts/heartbeat-engines.mjs` (13-engine registry: autonomy-cycle, sources-daily, publishing-run, outreach, prospect, codebase-health, engagement-growth, operating loops, reactivation-sequencer, alerts, meeting-briefs, inbox-intelligence, company-memory projector last).
- **Routes:** `POST /api/heartbeat/tick`, `GET /api/heartbeat/status`, `POST /api/heartbeat/autopilot`. Ticks are externally scheduled; no in-process interval.
- **Collections:** `heartbeatRuns`, `heartbeatLease` (singleton), `autopilotSettings` (singleton).
- **Trust:** **Verified** — `test-heartbeat.mjs` + per-engine suites.
- **Migration:** none. **Replacement:** never surfaced as product; Campaigns shows "Next automatic check" language only (`workspaces/campaigns.md` translation table). **Retire condition:** n/a — infrastructure.

### 17. Upstash auth session store — **Keep** — infrastructure
- **Source:** `scripts/auth-runtime-store.mjs` (Upstash Redis REST; memory fallback in dev), consumers `session-auth.mjs`, `session-security.mjs`, `security-rate-limit.mjs`; wired at `preview-server.mjs:8147`.
- **Stores:** sessions (`leos:auth:v1:session:<tokenHash>`), rate-limit buckets (atomic Lua), auth metrics. Decoupled from Supabase (PR #110); `authSessions` rejected by business storage (`scripts/storage.mjs:245`).
- **Trust:** **Verified** — `test-auth-runtime-store.mjs`, `test-session-security.mjs`.
- **Migration:** none. **Replacement/retire:** n/a.

### 18. Supabase business-data store — **Keep** — infrastructure
- **Source:** `scripts/storage.mjs` (`coreStateCollections` ~130 names, `singletonCollections`, `appendOnlyCollections`, `SupabaseCoreStore`, scoped writes, `writeChanges` optimistic concurrency, `claimCollectionItems` atomic claims); table `leos_core_records`.
- **Trust:** **Verified** — `test-scoped-write-hardening.mjs`, `test-storage-durability.mjs`, `test-supabase-*` suites, `test-registration-backlog.mjs`.
- **Rule carried forward:** every new collection registers in `coreStateCollections` or writes silently drop (the documented B1 trap).
- **Migration:** none. **Replacement/retire:** n/a.

### 19. Targeted reads — **Keep and enforce** → all workspaces
- **Source:** `SupabaseCoreStore.readCollections` (`scripts/storage.mjs:1150`) with frozen per-surface `*_READ_COLLECTIONS` (scoreboard, company health, support, calendar, inbox, automation control center, partner artifacts); PR #111 converted Founder Mode APIs off full `readState()`.
- **Trust:** **Verified** — `test-targeted-collection-reads.mjs`.
- **Enforcement going forward:** the performance rule in `05_DATA_AND_INTEGRATION_CONTRACT.md`; legacy full-state routes (campaign command, reactivation status, meeting briefs, RCAP partner ops) migrate as they are wrapped. **Retire condition:** n/a — this is the standard.

### 20. Artifact viewer — **Secondary only** → Advanced full record
- **Source:** `#item/<collection>/<id>` hash route (`preview-server.mjs:31454`), artifact cards, `scripts/partner-artifact-service.mjs` (`partnerProgramArtifacts`, `handoffPackets`).
- **Trust:** **Verified** — `test-artifact-deep-links.mjs`.
- **Migration:** none. **Replacement:** "Advanced full record" link inside the universal action panel. **Retire condition:** never primary; deep links preserved.

### 21. RCAP connection placeholder — **Hide until functional** → Advanced
- **Source:** `rcapConnectionCardHtml` (`preview-server.mjs:20904–20929`; literal "This is only a placeholder. Nothing connects or runs from here yet."), opener `:34918`, rendered in Settings `:25743`.
- **Trust:** **Partially verified** — `test-rcap-connection-placeholder.mjs` (extended-only) proves it is a placeholder.
- **Migration:** none. **Replacement:** hidden from normal Settings; visible under Advanced only until a real connection exists (the real RCAP subsystems — `rcap-revenue-os.mjs`, `production-activation.mjs` — are separate and unaffected). **Retire condition:** wire or retire per `07_MIGRATION_AND_DEPRECATION_LEDGER.md`.

### 22. SendGrid Test button — **Remove from normal UI**; Settings only after wiring
- **Source:** `preview-server.mjs:25612` (`toast('SendGrid test is not wired in this pass.')`), bound at `:25628`.
- **Trust:** **Unverified** as a test capability — it self-declares not wired.
- **Migration:** none. **Replacement:** removed; restored under Settings only when a real test-send exists. **Retire condition:** immediate hide (Release 1).

### 23. Wilma placeholder generation — **Defer** — not part of core Founder OS
- **Source:** `wilmaPlaceholderPreviewDataUrl` (`preview-server.mjs:3777`, `:3799` "Local placeholder only…"), stored as `imageStatus: "local_placeholder"` (`:3854–3857`). A separate real OpenAI path exists (`:12060`, `:12079`) gated by `ALLOW_LOCAL_IMAGE_FALLBACK`.
- **Trust:** **Unverified** as provider generation — the placeholder is proven local by the code itself.
- **Migration:** none. **Replacement:** deferred from the core product (the charter needs asset briefs, not image generation). **Retire condition:** optional future integration; until then the placeholder must not present as provider output (`07` ledger).

---

## PROPOSED rows (surfaced by regenerated evidence; for Roger to ratify)

### P1. Inbox intelligence I1–I4 — Keep → Today Communications / Relationships timelines
`scripts/inbox-intelligence.mjs` (plan-only engine, single authorized mailbox, toggle-gated, redacted signals only, drafts-never-send), `scripts/inbox-page-service.mjs`, routes `/api/inbox/*`, `/api/ui/inbox*`; collections `inboxSignals`/`inboxConfig`/`emailDrafts` (owner-only). Trust: **Verified** (`test-inbox-intelligence.mjs`, `test-email-draft-safety.mjs` strict gate). This is the signal source for Today Communications; privacy decision record remains binding.

### P2. Support desk — Keep → Today Needs attention + secondary queue
`scripts/support-desk.mjs` (states open→drafted→waiting→resolved→closed), founder view `scripts/founder-support-service.mjs`/`-api.mjs`; routes `/api/support/*`, `/api/ui/support*`; collection `supportIssues`. Trust: **Verified** (`test-support-desk.mjs`); founder surface **Partially verified** (extended-only suites).

### P3. Meeting briefs + founder calendar — Keep → Today Meetings
`scripts/meeting-briefs.mjs` (on-demand Gmail snippets, capped, never background), `scripts/founder-calendar-service.mjs`/`-api.mjs` (writes limited to tasks/audit/activity); routes `/api/meeting-briefs*`, `/api/ui/calendar*`, `/api/calendar/*`; collections `meetingBriefs`, `calendarSignals`. Trust: **Verified** (`test-meeting-briefs.mjs`, `test-calendar-readonly-safety.mjs`).

### P4. Prospect discovery (B5) — Keep → Campaigns Partner outreach (ranked list source)
`scripts/prospect-discovery.mjs` + `prospect-datasets.mjs`; gated by `PROSPECT_LIVE_DISCOVERY` (off → zero rows); collections `prospectCandidates`, `prospectDiscoveryRuns`, `prospectConfig`; loaders never attach email so discovered orgs can't become sendable; only `/api/prospects/approve` writes approved. Trust: **Verified** (`test-prospect-discovery.mjs`).

### P5. Company memory projection layer — Keep → foundation for Today and Relationships
`scripts/company-memory.mjs` + `company-memory-projector.mjs` (queueItems statuses/transitions, contact/org identity rules, capped event feed, approvals model — the data spine of `05_DATA_AND_INTEGRATION_CONTRACT.md`). Trust: **Verified** (`test-company-memory.mjs`, `test-company-memory-projector.mjs`).

### P6. Alerts engine — Keep → Today Needs attention (owner-locked email unchanged)
`buildAlertsEngine` registered in heartbeat; recipient hard-locked to owner (`preview-server.mjs:5513–5518`); collection `alerts`; settings-gated. Trust: **Verified** (`test-alerts-engine.mjs`).

### P7. Review-only imports (consumer list, expungement lifecycle) — Keep, labeled → Campaigns audience staging
`scripts/consumer-list-import.mjs` (confirm writes contacts force-held from waves), `scripts/expungement-lifecycle-sync.mjs` (ingest-only, staged always held); the inertness is deliberate safety, but the UI must say so (`07` ledger loose-ends row). Trust: **Partially verified** (both focused tests extended-only).

### P8. RCAP revenue OS + production activation — Keep dormant → Advanced
`scripts/rcap-revenue-os.mjs` (7 `rcapRevenue*` collections), `scripts/production-activation.mjs`, `/api/rcap/partner-ops`, `/api/production-activation/rcap/*`. Not part of the four workspaces; remains Advanced. Trust: **Verified** (`test-rcap-revenue-os-foundation.mjs` + queue tests).

### P9. Operator search — Consolidate → global Search
`scripts/operator-search.mjs`, `#operator-search` route with real safe actions (`preview-server.mjs:25063–25068`). Trust: **Unverified** for global-search parity (no focused test of search coverage). Becomes the seed of the global Search control.

### P10. Press outreach — **does not exist in main**; NEW scope for the Press lane
Verified absence at `a3793c3`: no press engine, no press collections in
`coreStateCollections`, no send path; the local branch `command-center-press-media-brain-v1`
(tip `dcbee05`) is **not** an ancestor of HEAD. What exists is press as a
classification/lane inside read-only surfaces (`automation-control-center-service.mjs`
lanes; `relationship-service.mjs` category `press`; scoreboard press counters). Trust for
"press engine": **Unverified — NONE** (the review-lane tests prove classification only).
The Campaigns Press lane is therefore NEW in `08_DELIVERY_PLAN.md`, sharing outreach
infrastructure per the charter.

---

## Prohibition on parallel implementations

No parallel implementation of **tasks, CRM records, campaign engines, activity
timelines, or storage** may be created during consolidation. Every new surface is a
projection or adapter over the single live implementation named above. Evidence:
`evidence/parallel-implementations.md` — the live tree has exactly one storage engine,
one server, one copy of each campaign engine.

`social-clean/` is an existing parallel copy (an untracked, gitignored, ~2-week-stale
full clone of the repo, referenced by nothing). Its removal is documented in
`07_MIGRATION_AND_DEPRECATION_LEDGER.md` and required as a Release 1 precondition in
`08_DELIVERY_PLAN.md` — executed in a separate future PR/cleanup, **not** in this
documentation PR.
