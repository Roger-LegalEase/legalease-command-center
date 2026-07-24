# 05 — Data and Integration Contract

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

Derived from the `coreStateCollections` registry in `scripts/storage.mjs` (~130
registered collections; 14 singletons; 7 append-only ledgers) and the
`scripts/company-memory.mjs` models, at `a3793c3`. Collections not named here keep their
current contracts; nothing in this document changes storage — it records what is
authoritative so projections are built on the right source.

General rules that apply to every entity below:

- **Registration:** a collection persists on Supabase only if registered in
  `coreStateCollections` (`scripts/storage.mjs:15–224`); `normalizeCollectionNames`
  rejects unregistered names (`:246–247`).
- **Mutation paths:** scoped writes (`writeCollections`), versioned item mutations with
  optimistic concurrency (`writeChanges`, `_version`, `StorageConflictError`), and atomic
  claims (`claimCollectionItems`). Full-state writes are prohibited for normal operation
  (the clobber class closed by the scoped-write hardening arc).
- **Visibility default:** operator roles (owner/admin/operator) via server-side
  authorization; collections in `OWNER_ONLY_COLLECTIONS`
  (`scripts/preview-server.mjs:12930`: `inboxSignals`, `inboxConfig`, `emailDrafts`,
  `leeThreads`, `leeMessages`, `leeRuns`, `leeMemory`) are owner-visible only.
- **Retention default:** indefinite unless a cap is stated; append-only ledgers are never
  deleted (`scripts/storage.mjs:226–231`).

## Entities

### Person
- **Authoritative collection:** `companyContacts` (projection layer over the source-lane
  contact collections: `outreachContacts`, `reactivationContacts`,
  `expungementLifecycleContacts`, `rcapRevenueContacts`).
- **Stable ID:** `cc-<sha256(email)[:16]>` (`companyContactId`,
  `scripts/company-memory.mjs:324`) — one contact per normalized email, the same identity
  rule the reactivation lane uses.
- **Required:** email (or explicit `contact_id`). **Derived:** merged `types`, `links`
  (collection refs into source lanes), org memberships. **Relationships:** →Organization
  (memberships), →Interaction, →Task, →Enrollment, →Suppression.
- **Valid roles:** `CONTACT_TYPES` (`company-memory.mjs:291`): consumer, paid_customer,
  abandoned_screening, checkout_abandon, partner_contact, prospect, funder, investor,
  vendor, attorney, support, media, internal. Roles are a **set** — one person may hold
  several without becoming several records.
- **Privacy:** PII (email, name). Consumer contacts are campaign data — see privacy rules
  below. **Mutation:** upsert-only merge via `upsertCompanyContact` (engines/projector);
  operator edits via authorized routes.

### Organization
- **Authoritative collection:** `companyOrganizations` (projection over
  `outreachOrganizations`, `partners`, `partnerPrograms`, `rcapRevenueAccounts`).
- **Stable ID:** `co-<sha256(domain||name)[:16]>` (`companyOrganizationId`,
  `company-memory.mjs:330`).
- **Types:** `ORGANIZATION_TYPES` (`:307`): rcap_partner, rcap_prospect, funder,
  city_county, workforce, legal_aid, reentry, advocacy, employer, nonprofit, vendor,
  investor, media.
- **Privacy:** business data. **Mutation:** upsert merge; operator edits authorized.

### Relationship
- **Authoritative source:** NOT a new collection. The Relationships workspace is a
  **projection** joining Person/Organization with `partners`, `prospectCandidates`,
  pipeline state, interactions, tasks, and suppression (see `workspaces/relationships.md`;
  `scripts/relationship-service.mjs` already defines the category vocabulary including
  `press`). Creating a parallel CRM store is prohibited (`01_CURRENT_STATE_REUSE_LEDGER.md`).
- **Derived fields:** last inbound / last outbound contact, who owes the next move, next
  follow-up, stage, strategic priority. **Mutation:** through the underlying collections
  only.

### Role
- **Authoritative representation:** the `types` set on Person and Organization (above).
  No separate role collection exists or may be created.

### Interaction
- **Authoritative collections:** `companyEvents` (append-only feed via
  `appendCompanyEvents`, cap `COMPANY_EVENTS_CAP = 1000`, risk levels
  `info|watch|needs_roger`, `company-memory.mjs:430–468`) plus `activityEvents` and
  lane-specific event stores (`reactivationEvents`, `outreachReplies`,
  `expungementLifecycleEvents`).
- **Stable ID:** `stableMemoryId` hash of source parts (`:113`). **Required:** type,
  plain-English title. **Retention:** capped rolling window for `companyEvents`; lane
  stores indefinite. **Mutation:** append-only from engines and completed founder actions;
  interactions are recorded as a byproduct of doing the work.

### Commitment
- **Authoritative collections:** `inboxSignals` with `kind: "commitment"` (carries
  `dueAt` for overdue escalation; redacted evidence lines only, never bodies —
  `scripts/inbox-intelligence.mjs`) surfaced as `queueItems` of type `inbox_commitment`.
- **Visibility:** owner only (`inboxSignals` is owner-only). **Mutation:** written by the
  inbox-intelligence engine (toggle-gated); resolved through the Today action panel.

### Task
- **Authoritative collection:** `tasks` (`scripts/tasks-engine.mjs`).
- **Work-item layer:** `queueItems` (`company-memory.mjs`): statuses
  `new → needs_roger → drafted → approved → scheduled → blocked → snoozed → dismissed → completed`
  with the explicit transition map `QUEUE_TRANSITIONS` (`:99–111`); terminal =
  `dismissed`, `completed`; types include approval, partner_followup, prospect_followup,
  support, meeting, inbox_reply, inbox_commitment, inbox_pipeline, etc. (`:73`); risk
  `safe|caution|dangerous`; cap `QUEUE_ITEMS_CAP = 500`.
- **Required:** type + plain-English title (`createQueueItem` throws otherwise, `:126`).
- **Mutation:** operators via task routes; engines via `emitQueueItem`; transitions only
  along `QUEUE_TRANSITIONS` (`transitionQueueItem`, `:207`).

### Meeting
- **Authoritative collections:** `meetingBriefs` (briefs, `scripts/meeting-briefs.mjs`)
  and `calendarSignals` (calendar context). Calendar events themselves live in Google
  Calendar (read-only); Gmail snippets attach on demand only, capped
  (`EMAIL_SNIPPET_MAX_CHARS = 240`, max 3 per attendee), never in the background.
- **Mutation:** `/api/meeting-briefs/prepare` is owner/admin; founder calendar actions may
  write only `{tasks, auditHistory, activityEvents}` (`scripts/founder-calendar-api.mjs`).

### Campaign
- **Authoritative collections:** `reactivationCampaign` (singleton: status, waves,
  thresholds, liveMode), `outreachCampaigns`, `campaigns` (operator campaign records).
- **Valid states (reactivation):** active / paused (with `pausedReason`), plus per-wave
  release state; transitions only through `reactivation-os.mjs` functions and the
  owner/admin campaign routes. **Mutation:** owner/admin routes + engines under autopilot;
  threshold trips auto-pause.

### Enrollment
- **Authoritative representation:** wave/sequence assignment fields on
  `reactivationContacts` (wave id, released state, hold/pause flags) and queued
  per-contact steps in the outreach queue (`outreachSequenceSteps` + queue records).
  No separate enrollment collection exists.
- **States:** staged → assigned → released → in-sequence → stopped
  (reply/suppression/hold) — enforced by `assignWaves` / `releaseWave` and suppression
  re-checks. **Mutation:** release is a human gate; imports always stage held.

### Attempt
- **Authoritative collections:** `reactivationAttempts`, `outreachAttempts`; the
  send-claim ledgers `reactivationSendClaims`, `outreachSendClaims` (append-only, one row
  per campaign+contact+step, written **before** any live send) are the duplicate-send
  protection and are never deleted.
- **Mutation:** engines only; claims via `claimCollectionItems` exclusively.

### Reply
- **Authoritative collections:** `outreachReplies` (partner lane), `growthInbox`
  (operator reply triage), inbound events via the signature-verified SendGrid webhook.
- **Effect:** a reply suppresses further sequence sends (reason `replied`). **Mutation:**
  webhook + operators.

### Suppression
- **Authoritative collections:** `outreachSuppressions`, `outreachUnsubscribes`,
  `outreachBounces`, plus per-contact hold/suppression fields on lane contacts.
- **States:** 8 reasons (`isSuppressed`, `scripts/outreach-os.mjs:145–178`). Removal of
  suppression is a one-confirmation founder decision (`06_SAFETY_AND_AUTOMATION_CONTRACT.md`)
  and must never happen in bulk automation. **Privacy:** PII — see privacy rules below.

### Approval
- **Authoritative collections:** `approvals` (states
  `requested → approved|rejected → executed → verified|failed`, `APPROVAL_STATES`,
  `company-memory.mjs:516`) and `approvalQueue` (content review queue).
- **Rule:** code never writes `approved` on outreach content — a human approves.
  **Mutation:** owner/admin decide routes; engines may only request and mark execution
  results.

### Support issue
- **Authoritative collection:** `supportIssues` (`scripts/support-desk.mjs`): states
  `open → drafted → waiting → resolved → closed`, urgency levels, classifier.
- **Mutation:** intake route, transition route, founder support actions (write-restricted
  by `ALLOWED_WRITE_COLLECTIONS` in `scripts/founder-support-api.mjs`).

### Social plan
- **Authoritative collections:** `posts` (drafts, channel variants, statuses through
  draft → review → approved → scheduled/posted), `contentBank`, `generationBatches`,
  `publishEvents`, `postImages`, `socialAccounts`, `publishClaims` (append-only),
  weekly-planner records via the social weekly planner service.
- **Gates:** `socialGuidelinesGate` + `renderQaForGeneratedImage` on the approve/schedule
  path. **Mutation:** operator routes; the live-publishing pipeline stays dormant behind
  env gates (Advanced only).

### KPI
- **Authoritative collections:** `metrics` (singleton), `funnelSnapshots`,
  `engagementGrowthSnapshots`, `operatingPulseSnapshots`, `runwayInputs` (manual inputs),
  plus live provider snapshots (Stripe revenue, signups) attached at read time.
- **Rule:** every KPI carries a `DATA_STATUSES` value (`company-memory.mjs:120`:
  connected, not_connected, needs_attention, loading, error, no_data, draft,
  needs_approval) — never a fake number standing in for a real one. **Mutation:** engines
  write snapshots; manual inputs via Settings; nothing fabricates.

### Health incident
- **Authoritative collections:** `osHealthSnapshots`, `systemHealth` (singleton),
  `sendgridWebhookHealth` (singleton), `alerts`, `soc2Incidents` (register),
  `heartbeatRuns` (engine run log).
- **Mutation:** engines and monitors write; founder actions acknowledge/resolve;
  exceptions project into Today Needs attention.

## Infrastructure boundary

Exactly two runtime stores plus connected providers — this boundary is load-bearing and
must not blur:

- **Upstash (Redis REST)** — sessions, login rate limiting, authentication runtime
  metrics. Key prefix `leos:auth:v1` (`scripts/auth-runtime-store.mjs`): session records
  (`tokenHash`, `csrfHash`, role, expiry, generation), rate-limit buckets via an atomic
  Lua script, auth metrics. Auth state never touches the business store: `authSessions`
  is rejected by `normalizeCollectionNames` (`scripts/storage.mjs:245`) and excluded from
  Supabase reads.
- **Supabase (Postgres, `leos_core_records`)** — business records: tasks, relationships
  (contacts/organizations/partners), campaigns, attempts, replies, suppressions, metrics,
  health records, and everything else in `coreStateCollections`.
- **Connected providers:**
  - **Gmail and Calendar** — authorized context only: read-only scopes, single authorized
    mailbox, toggle-gated inbox reading, on-demand snippets only.
  - **SendGrid** — outbound email and delivery feedback (signature-verified webhook).
  - **Stripe** — payment data (revenue snapshots; never presented as "cash").
  - **Analytics** — website acquisition data (signups endpoint; honest `available: false`
    when unconfigured).

## Performance rule

"Founder Mode routes use targeted authorized collection reads. Normal navigation must never hydrate the entire company state."

Mechanism: `store.readCollections(names)` with frozen per-surface `*_READ_COLLECTIONS`
allowlists (founder scoreboard, company health, support, calendar, inbox, automation
control center, partner artifacts), verified by `test-targeted-collection-reads.mjs`.
Legacy routes that still call full `readState()` (campaign command, reactivation status,
meeting briefs, RCAP partner ops) are reused **behind** new projections and migrate to
targeted reads as they are consolidated — never the reverse.

## Privacy rules

- Suppression exports and contact spreadsheets live **only in gitignored private
  storage, never repo root**. (Historical CSVs at repo root were PII incidents; the
  evidence directory of this package contains no env values, contact data, or
  suppression data.)
- `inboxSignals` store classifications, summaries, and redacted evidence lines only —
  never message bodies; Gmail bodies are never persisted.
- Owner-only collections stay owner-only when surfaced in new projections.
- Secrets never appear in browser payloads or logs (`scripts/test-secret-exposure.mjs`);
  no secret env-var **names** in outbound HTML.
