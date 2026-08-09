# Wave 0 — RCAP Prospect CRM Repository Audit and Architecture Decision

**Packet:** 0 · **Wave:** 0 · **Status:** Audit only — no code, migration, flag, env, or provider change
**Audited at:** `b83e5326e5ba21e6652432073b0db5f94435a1fb` (branch `claude/rcap-prospect-crm-wave-0-8p5kxb`, default `main`, clean worktree)
**Date:** 2026-08-09

> Every path below was opened and confirmed at this SHA. Paths named in the master build plan as
> "likely targets" are marked **CONFIRMED**, **RENAMED**, or **ABSENT** — none were assumed.

---

## 0. Headline architecture decision

**Build the RCAP Prospect CRM as a projection and extension of the existing Founder OS
Relationships workspace. Do not create a new CRM, list, timeline, contact store, or partner
database.**

The repository already contains, live and tested, the substrate this product needs:

| Master-plan concept | Already exists at HEAD | Verdict |
|---|---|---|
| Relationships workspace + saved views | `scripts/relationship-service.mjs`, `FOUNDER_OS_RELATIONSHIP_VIEWS` | **Extend** |
| Unified CRM over many identity stores | `relationship-service.mjs` projects **12** identity collections | **Extend** |
| `partner_prospect` ("Potential partner") category | `RELATIONSHIP_CATEGORIES` in `relationship-service.mjs:27` | **Reuse as-is** |
| Account / program / contact for RCAP | `rcapRevenue{Accounts,Contacts,DealSeeds,QueueTasks,ImportBatches,Events,Signals}` | **Reuse as-is** |
| Workbook import + identity resolution | `scripts/rcap-revenue-os.mjs`, `scripts/clinic-directory-import.mjs` | **Extend** |
| Unified per-relationship timeline | `buildRelationshipDetail` (10 timeline sources) | **Extend** |
| Suppression / eligibility | `outreach-os.mjs` `isSuppressed`, `outreachSuppressions`, `outreachUnsubscribes` | **Reuse — never fork** |
| Exact-message draft + Gmail handoff, no send | `communication-composer-service.mjs` (`externalActions: 0`) | **Extend** |
| Durable send claims / idempotency | `outreachSendClaims`, `reactivationSendClaims`, `claimCollectionItems` | **Reuse as-is** |
| Audit events | `scripts/audit-service.mjs`, `auditHistory`, `soc2AuditLogs` | **Reuse as-is** |
| Server-authoritative feature flag pattern | `scripts/ui/founder-os-config.mjs` | **Copy the pattern** |

**Genuinely net-new** (verified absent by content search, not by filename):
source records, claim records with `fact_class`, research unknowns, proposed CRM corrections,
profile runs/versions/sections with dependency invalidation, message-version content hashing,
exact-message approval binding, and any Google **Drive/Docs** read path.

The single largest risk to this build is **not** missing infrastructure. It is **duplicating
infrastructure that already exists** — the repository has an explicit, tested prohibition on
that (`docs/founder-os/01_CURRENT_STATE_REUSE_LEDGER.md`, "Prohibition on parallel
implementations"). Wave 1 must land inside that prohibition, not beside it.

---

## 1. Repository, runtime, toolchain

| Item | Value |
|---|---|
| Root | `/home/user/legalease-command-center` |
| Current branch | `claude/rcap-prospect-crm-wave-0-8p5kxb` (assigned; overrides plan's `chore/rcap-crm-w0-audit`) |
| Default branch | `main` — remote `Roger-LegalEase/legalease-command-center` |
| Worktree | Clean at audit start; single worktree, no other checkouts |
| Package manager | npm with committed `package-lock.json`; `npm ci` is the contract (`AGENTS.md`) |
| Runtime declared | `engines.node: 24.x` |
| Runtime present | **Node v22.22.2 — mismatch.** `npm install` emits `EBADENGINE`; tests still pass |
| Module system | ESM (`"type": "module"`), `.mjs` throughout |
| Dependencies | Only `pg` + `sharp` runtime; `@playwright/test` + `@axe-core/playwright` dev |
| Server | Custom Node HTTP server, `scripts/preview-server.mjs` — **42,586 lines** |
| Framework | None. No React/Next/bundler. Hash routing, server-rendered HTML strings |

**Framework conclusion:** the custom Node HTTP server and hash routing are current. Rule 17
(no framework rewrite) is satisfied by extending `preview-server.mjs` and `scripts/ui/*`.

### Exact commands (verified by execution or by reading `package.json`)

```text
Install (contract):   npm ci
Install (used here):  npm install --no-audit --no-fund
Syntax gate:          npm run check         # ~200 `node --check` calls; also `npm run precheck`, `npm run postcheck`
Canonical tests:      npm test              # ~140 sequential focused suites, && chained
Extended tests:       npm run test:extended # scripts/run-extended-tests.mjs (differential runner)
Focused test:         node scripts/test-<name>.mjs
Browser tests:        npm run test:browser  # scripts/run-browser-tests.mjs (Playwright)
Browser install:      npm run test:browser:install   # NOT needed here; Chromium preinstalled
Accessibility:        npm run test:vnext-accessibility   # + tests/browser/accessibility.spec.mjs (axe)
Visual harness:       node scripts/partners-visual-harness.mjs
                      node scripts/capture-vnext-partners-train.mjs
Security scans:       npm run secret:scan · npm run pii:scan · npm run security:scan:branch
Migrations:           npm run migrations:validate · npm run restore:drill
Full local gate:      npm run check && npm test && npm run test:extended && npm run test:security-hardening
Dev server:           npm run dev           # scripts/preview-server.mjs
```

**Lint: none. Type-check: none.** There is no ESLint, Prettier, or TypeScript configuration in
the repository. `npm run check` (`node --check` per file) is the only static gate. The
`CLAUDE_RCAP_CRM_TEMPLATE.md` placeholders for Lint and Type check should be filled with
`(none — `npm run check` is the static gate)`, not invented.

**Build: none.** No build step; the server renders at runtime.

### Toolchain verified working at this SHA

```text
node scripts/test-vnext-route-inventory.mjs        → 75 canonical routes, 53 aliases, 6 primary nav items
node scripts/test-founder-os-relationships.mjs     → pass (flag on/off parity asserted)
node scripts/test-rcap-revenue-os-foundation.mjs   → pass
node scripts/test-vnext-relationships.mjs          → PASS  {"relationships":7,...,"externalActions":0}
```

---

## 2. Route map and hash-parsing convention

**Convention:** client-side hash routing. `#<route>` and `#<route>/<sub>/<id>`. The live
router lives in generated browser code inside `preview-server.mjs`; `scripts/ui/navigation.mjs`
holds `routeRegistry` (the inventory), and `scripts/ui/route-compatibility.mjs` is the
canonicalizer (`resolveRouteCompatibility`) that resolves aliases, object links, and
destinations. `scripts/test-vnext-route-inventory.mjs` asserts the registry matches the live
literals in the server — **any new route must be added in both places or that test fails.**

Route IDs are validated and encoded: `safeId()` in `relationship-api-integration.mjs:18`
rejects control characters, `<>"'\``, `javascript:`/`data:`/`vbscript:` schemes, and path
traversal, capping at 320 chars. Reuse this helper; do not write a second one.

Counts at HEAD: **75 canonical routes, 53 aliases, 6 primary navigation items.**

Routes material to this build:

| Hash | Renderer | Notes |
|---|---|---|
| `#today` | `commandCenterOverviewHtml` | aliases `overview`, `cockpit` |
| `#partners` | `partnersPageHtml` | aliases `partner`, `partner-hub`. **This is "Relationships"** when `FOUNDER_OS_SHELL=true` |
| `#prospects` | `rcapProspectsPageHtml` | aliases `prospect`, `rcap-prospects`, `rcap-pipeline` |
| `#campaigns` | → `outreach` when both vNext flags on | **Contended route — see §9** |
| `#outreach` | `outreach-home.mjs` | vNext Outreach home |
| `#revenue` | `revenuePageHtml` | Scoreboard target |
| `#lee` | `leePageHtml` | Le-E; becomes a panel under `FOUNDER_OS_LEE_PANEL` |
| `#item/<collection>/<id>` | artifact viewer | deep links preserved, secondary only |
| `#production-activation-rcap` | `rcapReviewWorkspaceHtml` | RCAP program review (Advanced) |

**Important:** there is **no `#relationships` route.** The Relationships workspace is
`#partners` relabelled by `FOUNDER_OS_PRIMARY_WORKSPACES`. The master plan's suggested
`#relationships?view=rcap-prospects` must therefore be realised either as a new alias set on
the `partners` entry or as query-state on `#partners`. **Recommendation: add
`relationships` as an alias of `partners`** (registry + live literal + inventory test), then
express the saved view as `#partners?view=rcap-prospects`. This keeps every existing partner
bookmark alive and satisfies §7 of the plan without a second destination.

---

## 3. Ownership of each named surface

| Surface | Owning modules | API |
|---|---|---|
| **Relationships** | `relationship-service.mjs`, `relationship-api-integration.mjs`, `ui/pages/founder-relationships-style.mjs`, `ui/relationship-drawer.mjs` | `GET /api/ui/relationships/:id`, `POST /api/ui/relationships/:id/action` |
| **Partners** | `partner-api-integration.mjs`, `partners-home-service.mjs`, `partner-record-actions.mjs`, `partner-lifecycle.mjs`, `partner-program-engine.mjs`, `partner-artifact-service.mjs`, `ui/pages/partner{s-home,-record}.mjs`, `ui/view-models/partner{s-home,-record,-activity,-stage}.mjs` | `/api/ui/partners/*` |
| **Prospects** | `prospect-discovery.mjs`, `prospect-datasets.mjs`, `prospect-selection.mjs`, `ui/pages/prospect-workbench.mjs` | `GET /api/prospects/selection`, `POST /api/prospects/{approve,reject}` |
| **RCAP (revenue/workbook)** | `rcap-revenue-os.mjs`, `rcap-partner-ops.mjs`, `production-activation.mjs`, `review-approval-engine.mjs` | `/api/rcap/partner-ops`, `/api/production-activation/rcap/*` |
| **Outreach** | `outreach-os.mjs`, `outreach-sequences.mjs`, `outreach-classifications.mjs`, `outreach-home-service.mjs`, `outreach-api-integration.mjs`, `partner-outreach-integration.mjs`, campaign wizard/detail modules | `/api/outreach/*`, `/api/ui/outreach/*`, `/api/approvals/decide` |
| **Today** | `ui/view-models/{today-view,founder-today-view}.mjs`, `today-page-service.mjs`, `ui/pages/today-page.mjs` | `/api/today/summary`, `/api/ui/today` |
| **Search** | `global-search-service.mjs`, `search-index-helpers.mjs`, `ui/global-search{,-view-model}.mjs`, `operator-search.mjs` | `GET /api/ui/search` |
| **Add/Create** | `global-create-service.mjs`, `ui/global-create.mjs`, `quick-capture-service.mjs` | `GLOBAL_CREATE_ENDPOINTS` |
| **Le-E** | `lee-assistant.mjs`, `lee-inbox-{api,service}.mjs`, `lee-conversation-context.mjs`, `ui/{lee-inbox-panel,pages/founder-lee-panel}.mjs` | `/api/lee/*`, `/api/ui/lee-inbox` |
| **Settings** | rendered inline in `preview-server.mjs`; Advanced routes in `FOUNDER_OS_ADVANCED_ROUTES` | — |

**Confirmation of master-plan "likely targets":**

| Plan path | Status |
|---|---|
| `scripts/preview-server.mjs` | **CONFIRMED** (42,586 lines) |
| `scripts/company-memory.mjs`, `company-memory-projector.mjs` | **CONFIRMED** |
| `scripts/outreach-home-service.mjs`, `outreach-api-integration.mjs` | **CONFIRMED** |
| `scripts/partner-outreach-integration.mjs`, `partner-lifecycle.mjs`, `partner-record-actions.mjs` | **CONFIRMED** |
| `scripts/prospect-discovery.mjs`, `prospect-datasets.mjs` | **CONFIRMED** |
| `scripts/google-workspace.mjs` | **CONFIRMED** — Gmail + Calendar read-only only; **no Drive/Docs** |
| `scripts/growth-inbox.mjs`, `meeting-briefs.mjs` | **CONFIRMED** |
| `scripts/global-create-service.mjs`, `global-search-service.mjs` | **CONFIRMED** |
| `storage.mjs` | **RENAMED** → `scripts/storage.mjs` (plus a separate `lib/storage/` Postgres path) |
| `scripts/ui/*`, `scripts/fixtures/*` | **CONFIRMED** |

---

## 4. Persistence, collections, visibility, allowlists, write health

**Canonical store:** `scripts/storage.mjs` → `SupabaseCoreStore` over a single generic table:

```sql
create table public.leos_core_records (
  collection text not null,
  item_id    text not null,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, item_id)
);
alter table public.leos_core_records enable row level security;  -- no anon policies; service role server-side only
```

**This is the single most consequential finding for Wave 1–2 planning:** because the table is
generic `(collection, item_id, payload jsonb)`, **new RCAP collections require no SQL DDL and
no new RLS policy.** They require exactly one thing:

> **Registration in `coreStateCollections` (`scripts/storage.mjs:17`).** An unregistered
> collection writes fine on the local JSON adapter and is **silently dropped** on Supabase —
> the documented "B1 trap" that has already destroyed `settings`, `automationEvents`, and
> `reactivationContacts` data in production. Every registration must be asserted by a focused
> test, which is the repository's established convention.

Registered RCAP-relevant collections today: `rcapRevenueAccounts`, `rcapRevenueContacts`,
`rcapRevenueDealSeeds`, `rcapRevenueQueueTasks`, `rcapRevenueImportBatches`, `rcapRevenueEvents`,
`rcapRevenueSignals`, `prospectCandidates`, `prospectDiscoveryRuns`, `prospectConfig`,
`clinicNamedContacts`, `companyContacts`, `companyOrganizations`, `companyEvents`, `queueItems`,
`partners`, `partnerPrograms`, `partnerProgramArtifacts`, the 12 `outreach*`, the 5
`reactivation*`, `tasks`, `activityEvents`, `auditHistory`, `soc2AuditLogs`, `approvals`,
`approvalQueue` (~130 total).

Special sets: `singletonCollections` (14), `appendOnlyCollections` (7 — includes the claim
ledgers; never deleted, never reconciled), `hydrationExcludedCollections`, `reconcileEligibleCollections`.

**Write contract (`storage.mjs`), inherited by every new surface:**

| Term | Behavior |
|---|---|
| Single chokepoint | `submitCoreMutations` is the only caller of `rpc/leos_apply_core_mutations`; asserted structurally |
| Serialization | FIFO executor, at most 1 in-flight core-mutation RPC per process |
| Bounded queue | 32 pending, then **immediate 503 `SUPABASE_WRITE_QUEUE_SATURATED`** with zero network |
| Pre-network deadline | Past safe wait (20s default) → shed **before** send, `SUPABASE_WRITE_QUEUE_EXPIRED` |
| **No retries, ever** | A timed-out mutation may have committed; resubmitting is a duplicate-write risk |
| Scoped writes | `writeCollections` with a per-surface allowlist; an unexpected collection **throws** |
| Optimistic concurrency | Version conflict is an answer, not a retryable error (migration `20260728_001`) |
| Atomic claims | `claimCollectionItems` — unique `(collection, item_id)` insert **is** the idempotency test |
| Targeted reads | `readCollections(NAMES)` with frozen per-surface `*_READ_COLLECTIONS`; full `readState()` is legacy |
| Health | 3-state `connected` / `degraded` / `disconnected`, cached, single-flight, never self-retrying |

**Open item carried forward (`loose-ends.md` N5): no surface has yet been audited for correct
handling of `503 SUPABASE_WRITE_QUEUE_SATURATED` / `_EXPIRED`.** Every RCAP write surface must
render these as "not saved, safe to retry by hand" — never a silent failure, never an automatic
retry. Wave 1 should be the first surface that gets this right, and should test it.

**Visibility:** `recordVisibleToActor(record, role)` (`global-search-service.mjs:98`) is the
row-level filter used across search, relationships, and partner surfaces. Server-authoritative.

**Pagination:** there is **no generic pagination helper.** `relationship-service.mjs` has none;
company-memory uses hard caps instead (`QUEUE_ITEMS_CAP 500`, `COMPANY_EVENTS_CAP 1000`,
`AGENT_RUNS_CAP 500`, `APPROVALS_CAP 500`). The master plan requires pagination for the prospect
list and Activity — **that is net-new work and must be built, not assumed.**

**Second storage path:** `lib/storage/` (`postgres.mjs`, `schema.sql`, `migrations.mjs`,
`memory-dev.mjs`) exists alongside `scripts/storage.mjs`. `docs/architecture-map.md` names
`scripts/storage.mjs` as the business-data boundary and `lib/storage/index.mjs` as sharing the
`runtime-security.mjs` startup contract. **Do not write RCAP data through `lib/storage`.**

---

## 5. Authentication, roles, authorization

- **Sessions:** `scripts/session-auth.mjs` — opaque tokens, hash-only durable storage, expiry,
  revocation, rotation, HttpOnly cookies, CSRF proof. Backed by Upstash Redis
  (`auth-runtime-store.mjs`), decoupled from Supabase; `authSessions` is *rejected* by business
  storage (`storage.mjs:245`).
- **Roles:** `owner`, `admin`, `operator`, `viewer` (`scripts/roles.mjs`).
- **Capabilities:** 31 named capabilities; `roleHasCapability(role, capability)`. Owner has all.
  Operator has a deliberately narrow internal set. Viewer has `view_aggregate_reports` only.
- **Enforcement:** `scripts/access-control.mjs` + `authorizeRequest`; endpoint hardening in
  `scripts/auth-endpoint-hardening.mjs`; DTO stripping in `scripts/role-dto.mjs`.
- **Rate limiting / headers:** `scripts/security-rate-limit.mjs`, `scripts/request-security.mjs`.

**Gap relevant to this build:** the master plan's role model (§6) names an explicit **Reviewer**
role that may approve profile sections. No such role exists. Options: (a) map Reviewer onto
`operator` plus one new capability, or (b) add a role. **Recommendation: (a)** — add capabilities
(e.g. `review_prospect_profile`, `approve_prospect_profile`, `approve_exact_message`) rather than
a fifth role, because `roles.mjs` is referenced by legacy permission maps and four test suites.
Adding a capability is additive; adding a role is not.

A live bug worth noting: the `prospects` route registry entry originally declared a capability
`"approve"` that does not exist, which denied every role including owner; it is now
`approve_final_artifact` with an explanatory comment. **Any new capability string must exist in
`capabilities` or it silently denies everyone.**

---

## 6. Existing contracts the CRM must consume, not re-implement

| Contract | Module | Key facts |
|---|---|---|
| **Task** | `tasks-engine.mjs` | statuses open/in_progress/waiting/blocked/done/archived; blocked requires reason; waiting requires `waitingOn`; snooze ∈ {1,3,7,14,30} days; optimistic version → 409 |
| **Task panel** | `task-workbench-service.mjs` | `GET/POST /api/ui/tasks/:id[/action]`, 12 KB body limit; writes only `tasks`, `auditHistory`, `activityEvents` |
| **Note / activity** | `activityEvents`, `auditHistory`, `evidencePackNotes` | `add_notes` capability |
| **File** | `partner-artifact-service.mjs`, `dataRoomItems`, `files-*` modules | |
| **Stage** | `partner-lifecycle.mjs`, `ui/view-models/partner-stage.mjs` | `PARTNER_STAGE_CONTRACT`, `INTERNAL_PARTNER_STAGE_MAPPING` — **extend this vocabulary; do not invent a parallel one** |
| **Approval** | `review-approval-engine.mjs` | `reviewStates` = review_required / in_review / approved / needs_revision / blocked / handoff_ready |
| **Approval queue** | `approvalQueue`, `approvals` | queue-then-approve: *code can never write `approved`* |
| **Suppression** | `outreach-os.mjs` `isSuppressed`, `recordSuppression`; `outreachSuppressions`, `outreachUnsubscribes`, `outreachBounces` | signed HMAC unsubscribe tokens |
| **Gmail** | `google-workspace.mjs` | **read-only**: `gmail.readonly` + `calendar.readonly`. No send, no draft-create, **no Drive/Docs** |
| **Gmail handoff** | `communication-composer-service.mjs` | `buildGmailComposeUrl`, `markCommunicationDraftSentManually`; `externalActions: 0`; suppression blocks the URL; `requestId` idempotency (dup → 409) |
| **SendGrid** | `sendgrid-webhook.mjs`, `sendgrid-activity.mjs`, `sendgrid-domain-auth.mjs` | raw-byte signature verification, durable replay claims, `sendgridWebhookHealth` |
| **Calendar** | `google-workspace.mjs`, `founder-calendar-service.mjs`, `meeting-briefs.mjs` | read-only; no calendar writes |
| **Queue** | `company-memory.mjs` | `queueItems`, statuses, transitions, `QUEUE_TERMINAL_STATUSES`, snooze/wake, risk levels |
| **Company memory** | `company-memory.mjs` + `-projector.mjs` | `companyContactId` = one contact per normalized email; `companyOrganizationId` = domain-or-name. **The dedup spine — reuse it** |
| **Audit** | `audit-service.mjs` (`createAuditService`) + `auditHistory` + `soc2AuditLogs` | append-only, tamper-evident |
| **Handoff** | `partner-journey-handoff-contract.mjs`, `handoffPackets` | existing signed-handoff contract |

---

## 7. Feature flags and environment conventions

**Convention** (`founder-os-config.mjs`, `vnext-config.mjs`): a pure module reads the **server**
environment only — never anything request- or browser-controlled — and parses with strict
`value === "true"`. Default off. Off restores prior behavior exactly; that *is* the rollback path.

Existing flags: `COMMAND_CENTER_UX_VNEXT` (+ `_SOCIAL`, `_OUTREACH`, `_FILES`, `_DISCOVERY`),
`FOUNDER_OS_SHELL`, `FOUNDER_OS_TODAY`, `FOUNDER_OS_RELATIONSHIPS`, `FOUNDER_OS_CAMPAIGNS`,
`FOUNDER_OS_PRESS`, `FOUNDER_OS_SCOREBOARD`, `FOUNDER_OS_LEE_PANEL`.

Live-action gates, **all default off**, all declared in `render.yaml`: `OUTREACH_LIVE_SEND`,
`REACTIVATION_LIVE_SEND`, `ALERT_EMAIL_LIVE_SEND`, `PROSPECT_LIVE_DISCOVERY`,
`ENABLE_LIVE_{LINKEDIN,X,FACEBOOK,INSTAGRAM,TIKTOK,THREADS}_POSTING`, `SENDGRID_WEBHOOK_ENABLED`.

**Blocker for planning (user-only):** none of the `COMMAND_CENTER_UX_VNEXT*` or `FOUNDER_OS_*`
flags appear in `render.yaml`. **The production values of these flags are unknown to this audit
and cannot be read from the repository.** Which UI Roger actually sees today — legacy shell,
vNext shell, or Founder OS four-workspace shell — determines where RCAP Prospects must be
attached. See §16.

**Recommended new flag:** `COMMAND_CENTER_RCAP_CRM_V1`, same pure-module pattern, in
`scripts/ui/founder-os-config.mjs` or a sibling `rcap-crm-config.mjs`. Default off.

---

## 8. Dead controls, gaps, duplication, honest zeros, provider readiness

Drawn from `docs/founder-os/evidence/loose-ends.md` and re-verified where cheap:

| Finding | Evidence | Impact on this build |
|---|---|---|
| Legacy cockpit task buttons are `toast()`-only no-ops | reuse ledger row 3 | Rule 16 — must not be copied |
| SendGrid **Test** button: "not wired in this pass" | `preview-server.mjs:25612` | Rule 16 |
| RCAP connection card: literal "only a placeholder" | `preview-server.mjs:20904` | Hide until functional |
| `#outreach/campaign/<id>` detail — **broken**, unguarded `MutationObserver` re-entry | `loose-ends.md` N1 | **Not a reusable starting point for Outreach Review** |
| Campaign detail Pause/Resume — dead by construction (`campaignActionPolicies` is not a registered collection) | `loose-ends.md` N2 | Cautionary: unregistered collection ⇒ permanently false capability |
| One reactivation campaign projected **twice** ("Unnamed campaign" + "Expungement.ai reactivation (B1)") — no cross-kind dedupe | `campaign-sources.mjs:262` | Prospect list must dedupe across source kinds |
| `#campaigns` contended between legacy card and vNext Outreach home; winner is an env var absent from `render.yaml` | reuse ledger A3 | **Outreach Review must own its route explicitly** |
| Seven separate identity stores | reuse ledger row 5 | Project; **never destructively merge** |
| Write-queue 503s unhandled by any surface | `loose-ends.md` N5 | New requirement for RCAP surfaces |
| 283 `test-*.mjs` files; 179 unreachable from `npm test`; 69 referenced nowhere | reuse ledger A7 | Put RCAP suites in the **strict** `npm test` chain |
| Node 22 vs declared 24 | this audit | Confirm CI runtime before Wave 6 |

**Provider readiness:** Gmail **read-only** (send/draft scope absent, would be new and requires
security review); Calendar read-only; **Drive/Docs entirely absent** — no scope, no client, no
code; SendGrid webhook + activity present and hardened, live send gated off; OpenAI/Anthropic keys
are env-declared and Le-E degrades without them.

---

## 9. Prototype → code mapping (all 12 screens)

| # | Prototype screen | Nearest existing code | Verdict |
|---|---|---|---|
| 1 | Today — RCAP decisions | `ui/view-models/founder-today-view.mjs`, `today-page-service.mjs`, `FOUNDER_OS_TODAY_SECTIONS` | **Extend** — add RCAP items to *existing* sections; no duplicate queue |
| 2 | RCAP Prospects | `relationship-service.mjs` + `FOUNDER_OS_RELATIONSHIP_VIEWS`; `ui/pages/prospect-workbench.mjs` for row patterns | **Extend** — new saved view over one list |
| 3 | Prospect Overview — Complete | `ui/view-models/partner-record.mjs`, `ui/pages/partner-record.mjs`, `relationship-drawer.mjs` | **Extend** — nearest structural analogue |
| 4 | Prospect Overview — Blocked | `ui/shell-states.mjs`, `ui/components/guided-empty-state.mjs` | **Extend** — blocker anatomy is net-new |
| 5 | Le-E Profile Workspace | *none* | **NEW** — 15-section contract does not exist |
| 6 | Profile — Source Conflict | *none* | **NEW** — no claim/source/conflict model |
| 7 | Activity | `ui/view-models/partner-activity.mjs`, `buildRelationshipDetail` timeline (10 sources) | **Extend** — add filters + pagination |
| 8 | Outreach Review — Ready | `communication-composer-service.mjs` (exact draft, no send) + `ui/communication-composer.mjs` | **Extend** — content hash + exact approval are NEW |
| 9 | Outreach Review — Blocked | `outreach-os.mjs` `validateCompliance`, `resolveOutreachSendDecision` | **Extend** — the 12 quality gates are NEW |
| 10 | Add Prospect — Start | `global-create-service.mjs`, `ui/global-create.mjs`, `quick-capture-service.mjs` | **Extend** |
| 11 | Add Prospect — Match | `company-memory.mjs` identity index; `rcap-revenue-os.mjs` import matcher; `prospect-selection.mjs` duplicate/collision badges | **Extend** — matcher exists |
| 12 | Mobile Prospect Overview (390×844) | `ui/shell-boundary.mjs`, `tests/browser/responsive-shell.spec.mjs` | **Extend** |

**Visual language:** the prototype's navy sidebar / warm-orange primary / neutral canvas / white
bordered cards is the repository's existing language — `assets/ui/*.css`,
`ui/pages/founder-os-base-style.mjs`, `ui/brand-contract.mjs`, guarded by
`npm run test:vnext-brand-contract` and `tests/browser/design-system.spec.mjs`. No new design
system is required or permitted.

---

## 10. Adapters vs new persistence

**Adapter / projection only (no new collection):**
- RCAP Prospects saved view → filter over the relationship projection
- Prospect Overview, Activity timeline → compose existing collections
- Contact ladder eligibility → `outreachContacts` + suppression + `clinicNamedContacts`
- Related accounts → `companyOrganizations` + `rcapRevenueAccounts`
- Today RCAP decisions → existing Today sections

**New collections required (register in `coreStateCollections`; no DDL):**

```text
rcapProspectSources          rcapProspectClaims           rcapProspectUnknowns
rcapProspectCorrections      rcapProfileRuns              rcapProfileVersions
rcapProfileSections          rcapContactStrategies        rcapOutreachPlans
rcapOutreachSteps            rcapMessageVersions          rcapMessageApprovals
rcapProspectOpportunities    rcapHandoffs
```

Naming follows the established `rcapRevenue*` convention. `rcapMessageApprovals` should be
**append-only** (revocation is a new row, never a mutation) — consistent with the claim ledgers.

**Do NOT create:** a prospect account table (use `rcapRevenueAccounts`), a contact table
(`rcapRevenueContacts`/`companyContacts`), a task table (`tasks`), an activity table
(`activityEvents`), a suppression table, a claim/idempotency ledger, or an audit table.

---

## 11. Migrations, allowlists, RLS

**Migrations required: none for new collections.** The generic `leos_core_records` shape absorbs
every collection above. Migrations exist only for behavioral SQL (`supabase/migrations/`, 3 files
at HEAD: production hardening, perf index + statement timeout, version-conflict non-retryable).
Each has a paired `supabase/recovery/*.md`; `npm run migrations:validate` enforces the pairing.

Locations that **must** change per new collection (this is the complete list):

1. `scripts/storage.mjs:17` — `coreStateCollections` (**mandatory or writes silently vanish**)
2. `scripts/storage.mjs:241/247` — `singletonCollections` / `appendOnlyCollections` if applicable
3. The owning module's `*_COLLECTIONS` constant (must stay in sync — the documented trap)
4. The surface's frozen `*_READ_COLLECTIONS` (targeted reads)
5. The surface's scoped-write allowlist (`*_WRITE_COLLECTIONS`) — unexpected names throw
6. A focused test asserting registration (repository convention, enforced by precedent)

**RLS:** `leos_core_records` has RLS enabled with **no anon policies**; access is service-role,
server-side only. **No RLS change is needed or should be made.** Row-level visibility is enforced
in application code via `recordVisibleToActor` — that is the layer to extend.

---

## 12. File ownership and lanes for Waves 1–6

**Integration captain — single-owner, serialize all edits, never parallel:**

```text
scripts/preview-server.mjs        (42,586 lines; route literals, renderers, API dispatch)
scripts/storage.mjs               (collection registry)
scripts/ui/navigation.mjs         (routeRegistry — paired with the server literals)
scripts/ui/route-compatibility.mjs
scripts/roles.mjs                 (capabilities)
package.json                      (check/test chains — merge-conflict magnet)
```

`test-vnext-route-inventory.mjs` cross-checks `navigation.mjs` against the live server literals,
and `test-client-script-syntax.mjs` / the legacy-shell-hash guard (`repin-legacy-shell.mjs`,
pinned in eleven suites — see `docs/founder-os/execution/lessons/`) mean **any inline-page edit
can fail eleven suites at once.** Budget for it; do not parallelize these files.

**Safe parallel lanes (new files, one owner each):**

| Lane | Files |
|---|---|
| A — Contracts & flag | `scripts/ui/rcap-crm-config.mjs`, `scripts/rcap-prospect-registries.mjs` |
| B — Import & identity | `scripts/rcap-prospect-import.mjs` (extends `rcap-revenue-os.mjs`) |
| C — List & Overview view models | `scripts/ui/view-models/rcap-prospect-{list,overview}.mjs` |
| D — Profile engine | `scripts/rcap-profile-{engine,sections,claims}.mjs` |
| E — Drive/Docs | `scripts/google-docs-source.mjs` (new; **provider decision required first**) |
| F — Outreach Review | `scripts/rcap-outreach-review-service.mjs` |
| G — Pages | `scripts/ui/pages/rcap-prospect-*.mjs` |
| H — Fixtures & tests | `scripts/fixtures/rcap-prospects.mjs`, `scripts/test-rcap-crm-*.mjs` |

---

## 13. Conflicting in-progress work

- Local branches: `main` and `claude/rcap-prospect-crm-wave-0-8p5kxb` only. Remote mirrors both.
  **No competing branch is checked out.**
- `command-center-press-media-brain-v1` (tip `dcbee05`) is referenced in the reuse ledger as
  **not an ancestor of HEAD** and is not present locally.
- `social-clean/` — a stale, gitignored full clone — is scheduled for removal
  (`07_MIGRATION_AND_DEPRECATION_LEDGER.md`). Not present in this container. Harmless here; do
  not recreate the pattern.
- **Active adjacent programme:** Founder OS Releases 1–8 are landing on `main` (last commits
  #153–#159 touch relationships projection, campaigns, press, contrast guard). **Wave 1 will
  rebase onto a moving `main`.** Re-run the delta preflight at the start of every wave.

---

## 14. External prerequisites and user-only blockers

These cannot be resolved by an implementation agent and gate specific packets:

| # | Blocker | Gates | Needed from |
|---|---|---|---|
| B1 | **Production flag posture unknown** — `COMMAND_CENTER_UX_VNEXT*` / `FOUNDER_OS_*` values are not in `render.yaml`. Which shell Roger sees decides where RCAP Prospects attaches | Packet 1, 3 | Roger |
| B2 | **Google Drive/Docs scope does not exist.** New scopes (`drive.readonly` / `documents.readonly`), OAuth consent change, and security review | Packet 6 (Wave 2) | Roger + security review |
| B3 | **Gmail send/draft scope does not exist** (read-only today). New scope + security review | Packet 11 (Wave 4) | Roger + security review |
| B4 | **The workbook is not in the repository.** `national_expungement_record_clearance_clinic_directory_2026(1).xlsm` and the 48 Google Doc links are absent. Import must be built against fixtures | Packet 2 | Roger supplies file (or a synthetic fixture) |
| B5 | **Reviewer role does not exist** — recommend new capabilities rather than a fifth role | Packet 1, 7 | Roger ratifies |
| B6 | **`#relationships` route does not exist** — recommend aliasing `partners` | Packet 3 | Roger ratifies |
| B7 | **Node 22 vs declared 24** — confirm the CI/production runtime | Wave 6 | Roger |
| B8 | Prototype package (`gallery.html`, `prototype.html`, 12 screens) is in session context but **not committed to the repository** | Visual verification, all waves | Roger decides whether to commit it |

**Privacy constraint restated (rule 25 + `docs/privacy-data-inventory.md`):** no participant
criminal-record facts, eligibility answers, case documents, or participant PII in any RCAP
collection. `clinicNamedContacts` is precedent: reference rows with *no send path*.

---

## 15. Recommended Wave 1 scope (bounded, from repository truth)

**Packet 1 — Foundation contracts and feature flag**
- `scripts/ui/rcap-crm-config.mjs`: `COMMAND_CENTER_RCAP_CRM_V1`, pure server-env module, strict
  `"true"`, default off, mirroring `founder-os-config.mjs`.
- `scripts/rcap-prospect-registries.mjs`: stage (extending `PARTNER_STAGE_CONTRACT`, not
  replacing), the 15 profile sections + 5 groups, section states, truth states (`verified_fact`,
  `supported_inference`, `open_question`, `recommendation`, `pilot_hypothesis`, `human_note`),
  contact roles, contact-point eligibility, outreach/message states, account-relation types,
  action registry.
- Register the 14 new collections in `coreStateCollections` **with a test asserting membership**.
- New capabilities: `review_prospect_profile`, `approve_prospect_profile`, `approve_exact_message`.
- `scripts/fixtures/rcap-prospects.mjs` + cross-account isolation harness.

**Packet 2 — Import and identity resolution**
- Dry-run-first workbook import extending `rcap-revenue-os.mjs`'s normalizers and
  `clinic-directory-import.mjs`'s "find the header row, never assume it" discipline.
- Column A–R mapping; identity match via `companyContactId` / `companyOrganizationId`; the six
  outcomes (create / update / add program / add contact / conflict / skip); full import report;
  provenance preserved; Google Doc URLs stored as references only (no fetch — B2).
- Audit event per decision. **Never overwrite newer/stronger data silently.**

**Packet 3 — RCAP Prospects list**
- Saved view over the relationship projection, `partner_prospect` category.
- Summary strip (6 counts), filters, table (8 columns), mobile cards, attention reasons.
- **Pagination is net-new** — build it.
- Loading / empty / unavailable / error states; honest zeros; deep links surviving reload.
- Route: alias `relationships` → `partners`; `?view=rcap-prospects`. Registry + server literal +
  inventory test together.

**Packet 4 — Prospect Overview, complete and blocked**
- Header, Overview/Profile/Activity switcher, Next Best Step, Account Snapshot, Best Contact,
  Outreach Plan summary, recent activity, Profile summary, context rail (Where Things Stand /
  Open Tasks / Files / Related Accounts), related-account warnings.
- Max four visible actions; **Draft email opens Outreach Review and never sends.**
- Safe writes for note / activity / next action through existing task and activity contracts.
- Blocked variant with the six-part blocker anatomy; the page stays useful while blocked.
- 390×844 with no horizontal overflow.
- Handle `503 SUPABASE_WRITE_QUEUE_SATURATED` / `_EXPIRED` honestly (`loose-ends.md` N5).

**Explicitly out of Wave 1:** Drive/Docs, claims/profile engine, exact-message approval, any
provider authority, any live send, any production migration.

**Wave 1 gate:** `npm run check && npm test` plus the new focused suites, browser responsive +
accessibility on changed surfaces, and flag-off rollback proving the current UI is unchanged.

---

## 16. Wave 0 exit gate

| Criterion | Status |
|---|---|
| No unresolved ambiguity risking a second source of truth | **Met** — decision in §0; adapters vs new persistence in §10; parallel-implementation prohibition adopted |
| Exact current commands and contracts known | **Met** — §1 (commands verified by execution), §4–6 (contracts). Lint/type-check confirmed *absent*, not guessed |
| Wave 1 has a bounded file/contract map | **Met** — §12 lanes, §15 scope |
| All user-only blockers named | **Met** — §14, B1–B8 |

**Exit verdict: PASS with named blockers.** B1 (production flag posture) and B6 (route naming)
should be answered before Packet 3 begins. B2/B3/B4 gate later waves and do not block Wave 1.
