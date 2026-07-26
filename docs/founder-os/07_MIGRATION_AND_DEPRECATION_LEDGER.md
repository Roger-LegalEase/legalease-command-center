# 07 — Migration and Deprecation Ledger

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

Every existing page, route, button, and major component carries exactly one status:

- **Keep** — remains, possibly relabeled, as part of the product
- **Consolidate** — merges into a four-workspace surface; route aliases preserved
- **Contextualize** — no longer a destination; appears inside the context that needs it
- **Advanced only** — visible only under Settings → Advanced
- **Hide now** — removed from visible UI immediately (Release 1); code untouched
- **Deprecate after parity** — visible until its replacement passes the release's parity requirement, then retired
- **Remove** — deleted (each removal in its own future PR, never this one)

Sources: `evidence/route-inventory.md` (all 75 routes + 53 aliases) and
`evidence/loose-ends.md` (buttons/stubs). The route→target mapping detail lives in
`02_TARGET_PRODUCT_AND_IA.md`; this ledger assigns fates.

## Pages / routes (all 75)

| Status | Routes |
|---|---|
| **Keep** | `today` (becomes the Today queue), `partners` (becomes Relationships), `campaigns` (reused inside Campaigns Reactivation), `settings`, `queue` (Review Desk → Social Review stage), `growth` (→ Campaigns Social), `os-health` (→ Scoreboard Platform health), `revenue`/`proof`/`metrics` (→ Scoreboard) |
| **Consolidate** | `cockpit`, `overview`, `daily-run`, `focus`, `tasks-today`, `tasks-this-week`, `morning-brief`, `evening-reflection`, `daily-closeout`, `milestones` → Today · `partner-hub`, `partner-programs`, `partner-pages`, `partner-dashboards`, `partner-reports`, `partner-proposals`, `pages`, `pilots`, `contacts`, `prospects` (records) → Relationships · `upload`, `production`, `production-linkedin-queue`, `production-twitter-x-queue`, `content-bank`, `sources`, `posted` → Campaigns · `funnel` → Scoreboard Acquisition · `operator-search` → global Search · `lee` → Le-E panel |
| **Contextualize** | `meetings` (→ Today Meetings), `support` (→ Today Needs attention + secondary queue), `alerts` (→ Today Needs attention), `automation` (→ Today Needs attention), `decisions` (→ contextual approvals), `growth-inbox` (→ Today Communications), `capture-inbox` (→ global Create + Today), `tasks`/`tasks-blocked`/`tasks-waiting` (→ Today secondary views), `reports`, `dataroom`, `evidence-room`, `assets`, `compliance`, `soc2-evidence`, `soc2-policies` (→ Files in context + Search) |
| **Advanced only** | `autonomy`, `data-integrity`, `smoke-test`, `safe-mode`, `handoff-contract`, `conversation-notes`, `operating-memory`, `soc2`, `soc2-access`, `soc2-audit`, `soc2-changes`, `soc2-vendors`, `soc2-incidents`, `production-activation-rcap` |
| **Keep (Settings)** | `operator-manual`, `roles` |
| **Deprecate after parity** | `more` (shell dispersed by the map), `item` (Artifact Viewer — secondary "Advanced full record" link remains; the destination page retires when the universal panel covers it) |

No route is **Remove** in this package: aliases and canonical routes keep resolving
until parity retires them (charter: old links preserved).

## Major components

| Component | Status | Notes |
|---|---|---|
| Task workbench drawer | Keep | Becomes the universal action panel (reuse ledger row 2) |
| Communication composer | Keep | Exposed consistently in Today + Relationships |
| Social post composer + channel variants | Keep | Campaigns Social |
| Social live-publishing pipeline (OAuth, scheduled publisher, Publish Now) | Advanced only | Dormant behind env gates; publish-now gate gap must be fixed before any activation (`evidence/publish-now-gate-review.md`) |
| Reactivation engine | Keep | Unchanged; new surface calls existing functions |
| Partner outreach engine | Keep | Unchanged |
| Prospect discovery (B5) | Keep | Feeds the ranked list; flag stays server-side |
| Automation Control Center | Deprecate after parity | Read models reused inside Campaigns (Release 4) |
| Campaign command controls | Keep | Reused behind the simplified Reactivation surface |
| Le-E assistant + Le-E inbox | Keep | Becomes the global side panel (Release 6) |
| Founder Scoreboard / Company Health services | Keep | Scoreboard workspace |
| Heartbeat + engines | Keep (invisible) | Never product |
| Inbox intelligence I1–I4 | Keep | Signal source for Today Communications |
| Meeting briefs + founder calendar | Keep | Today Meetings |
| Support desk | Keep | Today Needs attention + secondary queue |
| Company memory projector | Keep | Data spine for projections |
| Upstash auth store / Supabase store / targeted reads | Keep | Infrastructure |
| Artifact viewer | Contextualize | Secondary "Advanced full record" only |
| RCAP revenue OS / production activation | Advanced only | Until RCAP is a product decision |
| `social-clean/` directory | **Remove** | Untracked stale repo clone, referenced by nothing — `evidence/parallel-implementations.md`. Removal (delete directory + drop `.gitignore:59`) executed in a **separate future PR/cleanup**, never this documentation PR |

## Loose-ends table

Seeded from the outline, verified against `evidence/loose-ends.md`:

| Item | Current behavior | User risk | Immediate treatment | Final treatment |
|---|---|---|---|---|
| Cockpit "Mark Done" (`preview-server.mjs:24143`, `:24171`) | Toast only, no mutation | False belief work was completed | **Hide now** | Replace with task-workbench action (real `POST /api/tasks/:id/done`) |
| Cockpit "Edit Priority" (`:24141`) | Toast only, no mutation | Same false-completion belief | **Hide now** | Replace with task-workbench action |
| Cockpit "Move to Tomorrow" (`:24144`, `:24192`) | Toast or bare navigation | Same | **Hide now** | Replace with task-workbench snooze/reschedule |
| Guided-queue judgment-mode "Mark waiting"/"Mark done" (`:20034–20036`) | Toast only in this mode | Same | **Hide now** (this mode's fake actions) | Wire to real task actions |
| "Resolve Blocker" (`:24190`) | Toast only | Same | **Hide now** | Replace with real blocked→resolve transition |
| SendGrid Test (`:25612`, `:25628`) | Says "not wired in this pass" | Confusion about email readiness | **Remove from normal UI** | Restore under Settings only when a real test-send exists |
| RCAP connection (`:20904–20929`, `:34918`) | Opens placeholder details; dead end | Dead end masquerading as setup | **Advanced only** | Wire or retire |
| Review-only imports (`consumer-list-import.mjs`, `expungement-lifecycle-sync.mjs`) | Create held review records only (deliberate safety) | Appears operational end-to-end | **Label clearly** ("Imported contacts are held for review; nothing sends") | Connect (audience staging in Campaigns) or remove |
| Wilma generation (`:3777–3904`) | Local SVG placeholder stored as generated image | Looks like provider output | **Defer from core product**; keep the existing "Local placeholder only" label prominent | Optional future integration |
| Non-persistent folder creation | Already fixed: `Create folder` renders disabled with honest deferral copy (`scripts/ui/global-create.mjs:169`) | None remaining | Keep the honest disabled state | Real folders only if Files ever needs them |
| Unconnected revenue/signup metrics | Already fixed: live connectors + honest "Not wired yet" empty states (`preview-server.mjs:12764–12822`) | None remaining if labels stay honest | Keep honest labels | Connect remaining sources in the Scoreboard release |
| `social-clean/` | Untracked stale full clone, nothing references it | Editing the wrong copy; stale safety code mistaken for current | Do not touch in this PR | **Remove** in a separate future PR (`evidence/parallel-implementations.md`) |

## The rule

**"No visible button may remain if it cannot complete the action its label promises."**

---

# Addendum — 2026-07-25 evidence refresh at `fdbc334`

Appended, not rewritten. **No status above changes.** Every route fate, component status,
and loose-ends row stands as assigned. Below: new loose ends found at HEAD, each given a
status from the same vocabulary (Keep / Consolidate / Contextualize / Advanced only /
Hide now / Deprecate after parity / Remove); audit-era items now resolved; and one
component-status clarification. Source: `evidence/loose-ends.md` (2026-07-25 section) and
`evidence/2026-07-25-delta.md`.

## New loose ends (found at `fdbc334`)

| Item | Current behavior | User risk | Immediate treatment | Final treatment |
|---|---|---|---|---|
| vNext campaign detail route `#outreach/campaign/<id>` (`scripts/ui/pages/campaign-detail.mjs:38–39`) — e.g. `#outreach/campaign/campaign-reactivation-b1` | Renders permanent loading skeletons and **freezes the browser main thread**: an unguarded `MutationObserver` re-enters `load()`, which destroys the rendered root and rewrites "Loading Campaign…", producing another mutation. Verified in real Chromium against a healthy stubbed endpoint with a valid payload | Highest of the new items: the tab wedges, so the founder cannot leave the page or trust anything on screen. It looks like a data or Supabase problem and is neither | **Hide now** — remove the link target from every list and object link until the observer is guarded; a page that freezes the tab is worse than a missing page | **Keep** the surface, **fix the loop** (re-entrancy latch, as `social-home.mjs:228` and `automation-control-center.mjs:254` already do) before Campaigns Release 4 reuses it |
| Campaign detail Pause / Resume buttons (`scripts/campaign-detail-service.mjs:12`; rendered `scripts/ui/pages/campaign-detail.mjs:23`) | Never render. Capabilities are gated on `state.campaignActionPolicies`, which is **not** in `coreStateCollections` and **not** in `OUTREACH_READ_COLLECTIONS`, so both are permanently `false`. The server handler (`outreach-api-integration.mjs:390–394`) is real but unreachable from the product | Low today (invisible), high if someone "fixes" the visibility without wiring the collection: it would expose pause/resume with no policy source | **Advanced only** — do not surface until a real policy source exists | **Keep** the handler; either register/populate `campaignActionPolicies` or delete the capability path. Reactivation pause/resume already works on the legacy Campaigns page (`preview-server.mjs:18546`, `:18561`, `:18602`) — do not build a second one |
| Outreach list `Unavailable` fields (`scripts/ui/pages/outreach-home.mjs:109`, `:130–150`) | Honest nulls, not failures: canonical `campaigns` rows project audience/replies/outcome only from their own fields (`campaign-view.mjs:158–172`) while the reactivation singleton projects from live contacts (`:174–186`). Same column, two different meanings | Moderate: `Unavailable` reads as "the system is broken" when it means "this record has no such field", and the two source kinds are indistinguishable in the list | **Label clearly** — distinguish "no audience attached to this record" from "could not load" | **Keep** the honest-null convention; link canonical rows to their engine state so the field has a value rather than a disclaimer |
| Duplicate reactivation rows in the Outreach list (`scripts/ui/view-models/campaign-sources.mjs:262–271`) | The one live reactivation campaign appears twice — `campaign:campaign-reactivation-b1` ("Expungement.ai reactivation (B1)") and `reactivation:mvp-reactivation` ("Unnamed campaign", 3,762 enrolled / 3,528 excluded). No cross-kind dedupe | Moderate: two rows imply two campaigns and two audiences; one shows real numbers and one shows `Unavailable` | **Label clearly** in any interim surface (one is the ledger record, one is the engine) | **Consolidate** — one Reactivation campaign in the consolidated Campaigns surface: canonical row as the label, engine singleton as the state |
| Storage-layer 503 saves (`scripts/storage.mjs:628–647`) | Writes can be rejected before any network call (`SUPABASE_WRITE_QUEUE_SATURATED`) or shed past their deadline (`SUPABASE_WRITE_QUEUE_EXPIRED`); deliberately never retried | Unknown — no surface has been audited for how it presents a 503 save. Risk is a save that silently did not happen | **Keep** the shedding behavior (it is the fix, not a defect); audit surfaces for honest "not saved — safe to retry" copy | **Keep**; make the honest failure state part of the universal action panel |
| `scripts/ui/pages/campaign-wizard.mjs:62` observer | Same unguarded `MutationObserver` shape as campaign detail; **not tested** whether `activate()` can leave `root()` absent | Unknown | **No treatment assigned** — verify first | Assign after verification; if it loops, same fix as campaign detail |

## Loose-ends rows now resolved (audit-era items)

Recorded here so the table above is not re-worked in a future pass. The original rows are
preserved unchanged.

| Item | Status | Date | Evidence |
|---|---|---|---|
| Publish Now per-channel live gate (Release 1 Precondition A.1) | **Resolved** | 2026-07-24 | `preview-server.mjs:5857–5861`; `evidence/publish-now-gate-review.md` |
| sharp CVEs (Precondition A.2) | **Resolved** at 0.35.3 | 2026-07-24 | PR #113 |
| PII containment (Precondition A.3) | **Resolved** (gitignored `data/private/` + pre-commit gate); CI mode remains proposed | 2026-07-24 | PR #113; `08_DELIVERY_PLAN.md` |
| Node pinning (Precondition A.4) | **Resolved** — `engines: 24.x` + `NODE_VERSION` on both services | 2026-07-24 | PR #113 |
| Scheduled-publishing test on removed static-token auth | **Resolved** | 2026-07-24 | PR #114 |
| `supabaseConnected: false` in production | **Resolved** — `/api/version` reports `true`, `supabaseState: "connected"` | 2026-07-25 | `evidence/2026-07-25-production-verification.md` |
| Automatic Discovery Analytics write on every route change | **Resolved** — passive boot is write-free | 2026-07-25 | PR #118; `tests/browser/passive-boot-write-free.spec.mjs` |
| Denial audit rewriting the entire `soc2AuditLogs` array per denied request | **Resolved** — one budgeted insert, 30/min cap | 2026-07-24 | PR #116 |
| Full-table hydration on `/api/boot-state` and `/api/today/summary` | **Resolved** — targeted `readCollections` | 2026-07-25 | PR #117 |

Still open and unchanged: the ten confirmed stubs in `evidence/loose-ends.md` §B
(re-pinned to current line numbers, all still toast-only or placeholder), and the
`social-clean/` removal.

## Component-status clarification

| Component | Status | 2026-07-25 note |
|---|---|---|
| Upstash auth store / Supabase store / targeted reads | **Keep** (unchanged) | The storage engine now carries an explicit serialization contract — one active core mutation per process, bounded queue, pre-network deadline, no retries, split read/write capacity, PII-free attribution. Reuse it as-is; do not add a second write path. Full terms in the `01_CURRENT_STATE_REUSE_LEDGER.md` addendum A1 |
| `social-clean/` directory | **Remove** (unchanged) | Reaffirmed: still present, still unreferenced, now 16 days stale and missing the entire #116–#118 perf arc, including all of the storage protections above. Still a separate future PR |
| vNext campaign detail + Outreach list projection | **Keep**, with the defects above | Added to this ledger for the first time; see the new loose-ends table |

---

# Addendum — 2026-07-26, Release 3 (Relationships)

Appended, not rewritten. **No status above changes.**

## Routes: nothing was superseded

Release 3 hides no route. The delivery plan permits `partners`, `partner-hub`, `partner-*`,
`contacts`, `pages` and `pilots` to alias into Relationships **after** parity, and parity for
the partner sub-pages (programs, dashboards, reports, proposals) means every action they offer
exists on the unified record. That has not been demonstrated, so every one of them still
renders exactly what it rendered before, asserted by
`tests/browser/founder-os-release-3.spec.mjs`. The reclaim stays available to a later release.

## Component-status confirmations

| Component | Status | 2026-07-26 note |
|---|---|---|
| `scripts/relationship-service.mjs` | **Keep** | Recorded here for the first time. It is the single CRM projection over the seven identity stores and it already existed at HEAD — Release 3 extended it rather than building a second one. Any future relationship work extends this module; a parallel projection is prohibited by the reuse ledger |
| Partner records + `partner-api-integration.mjs` | **Keep** (unchanged) | Still the foundation. Release 3 added no partner route and changed no scoped-write allowlist |

## New loose ends (found at `dc75baa`)

| Item | Current behavior | User risk | Immediate treatment | Final treatment |
|---|---|---|---|---|
| Email normalization never collapses plus-addressing (`company-memory.mjs:323-328`, `reactivation-os.mjs:167-171`, `outreach-os.mjs:109-111`) | Normalization is trim + lowercase only, everywhere. `f+a@example.com` and `f+b@example.com` are two separate identities in every lane | Moderate: a real person can hold two identities and appear twice, and the CRM cannot tell that they are one | **Label clearly** — the Release 3 ambiguity surface reports records that share an address, but it cannot see this case because the addresses genuinely differ | **Keep** the normalization. The normalized address is hashed into a **persisted** record id (`companyContactId`, `contactIdForEmail`, `lifecycleIdForEmail`), so changing it re-keys live records. Any fix is a data migration with its own PR, never a side effect of a UI release |
| Mark-sent cascade covers five of the seven identity stores (`communication-composer-service.mjs:36-53`, `:1024-1028`) | `rcapRevenueContacts` and `expungementLifecycleContacts` appear in neither the composer's read collections nor its write list | Moderate: recording a manual send to someone known only through those two lanes updates no last-contact anywhere, so the relationship looks quiet when it is not | **No treatment in Release 3** — it is a write-path gap and Release 3 is read-side | **Keep** the cascade; add the two lanes to its read and write sets with tests, in the release that next touches the composer |
| Two relationships sharing one contact email | Previously invisible: each record resolved correctly by its own link and nothing compared them | Moderate — the "duplicate people" failure the consolidation exists to prevent | **Resolved for visibility** in Release 3: every relationship involved reports `possibleDuplicates` and `needsIdentityConfirmation`, and nothing is merged | **Keep** the surfacing. A ratified merge writes links and never deletes lane records (`01_CURRENT_STATE_REUSE_LEDGER.md:56`); that action is not built yet |

---

# Addendum — 2026-07-26, Release 4 (Campaigns)

Appended, not rewritten. **No status above changes.** No route was hidden by Release 4.

## Component-status confirmations

| Component | Status | 2026-07-26 note |
|---|---|---|
| Reactivation engine | **Keep** (unchanged) | Release 4 is an interface over it. The projection is read-only, adds no route, and calls no mutating function; the engine's decision functions remain the enforcement layer and produce every number and every blocked reason the surface shows |
| Campaign command controls | **Keep** (unchanged) | `buildCampaignCommandView` is reused wholesale rather than reimplemented. The Release 4 endpoint reads it through a frozen 13-collection targeted list instead of the full `store.readState()` that `/api/campaign/command` still uses |
| Press lane | **Deferred by decision** | Roger's answer to the Release 4 build-or-defer checkpoint, 2026-07-26: defer. The lane renders the charter's honest not-built state. `FOUNDER_OS_PRESS` exists so the lane has one switch, and a test asserts enabling it does not fabricate a campaign |
| Social live-publishing pipeline | **Advanced only** (unchanged) | Reaffirmed. Release 4's Social lane exposes **no publish affordance at all**, so no publish route is relocated and the Publish Now gap cannot be inherited |

## New loose end (found at `922a555`)

| Item | Current behavior | User risk | Immediate treatment | Final treatment |
|---|---|---|---|---|
| Two publish paths establish the live gate by different means | `publishPostNow` calls `livePostingEnabledForChannel` (`preview-server.mjs:5858`) and its route is additionally 403'd unconditionally by `auth-endpoint-hardening.mjs`. The **vNext** path (`POST /api/ui/social/post/:id/publish`) never calls that function; it derives `facts.gate` from the **persisted** `state.runtime.livePostingGates`. Verified directly: `runtimeGates` (`post-readiness-sources.mjs:145-156`) accepts a boolean or an `{enabled:boolean}` object and yields `null` otherwise, and `eligibility` blocks on both `"off"` and `"unavailable"` (`post-publishing-controls.mjs:441-442`) — **shape-tolerant and fail-closed. There is no fail-open bug** | Low today, because the vNext path is fail-closed and the legacy route is 403'd. The risk is architectural: a future change to the persisted shape, or someone populating that field, alters a publish decision without touching the function everyone believes governs it | **No treatment in Release 4** — the Social lane has no publish affordance, so the release depends on neither path | **Consolidate**: the vNext path should call `livePostingEnabledForChannel` like the scheduled worker does, with `test-publish-now-live-gate.mjs` promoted out of extended-only into the strict chain, in the release that next activates publishing |
