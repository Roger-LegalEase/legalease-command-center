# LegalEase OS — Growth Automation Build Plan

**Version 2 — updated June 20, 2026.** This revision incorporates the read-only repository inspection and adds an Instagram audience-import phase immediately after the core loop foundation.

## 1. Objective

Build a controlled Growth Automation layer inside the existing LegalEase OS that can operate the Fresh Start Sprint and future campaigns across:

- social content production, approval, scheduling, publishing, and performance;
- email list hygiene, segmentation, sequencing, suppression, and product-triggered nurture;
- Expungement.ai completion reminders and conversion tracking;
- Instagram follower/following export ingestion, relationship reconciliation, warm-audience review, and outreach preparation;
- grassroots partner outreach, share kits, QR attribution, and follow-up;
- inbound reply/comment/DM triage;
- campaign reporting, optimization suggestions, proof capture, and UGC consent;
- auditable safety gates that keep legal judgment and sensitive communication human-controlled.

The OS should become the campaign control plane. External providers remain responsible for final email delivery, social posting, and other channel-specific actions.

## 2. Operating principles

1. **One OS, not a new disconnected app.** Use the current Today / Command / Queue / Sources / Settings information architecture.
2. **Provider adapters, not hard-coded integrations.** Email and social connectors expose capabilities and can be replaced without rewriting campaign logic.
3. **Events drive loops.** Product, email, social, partner, and QR activity normalize into one safe event contract.
4. **Outbox before side effects.** Every external action is a durable job with an idempotency key, approval state, attempt history, and kill switch.
5. **PII separation.** Raw emails, names, consumer case facts, Wilma transcripts, and criminal-history details do not enter general loop/event tables.
6. **Shadow first.** New loops create drafts, reports, and Queue cards before they are permitted to send or publish.
7. **Human checkpoints remain.** Legal-risk replies, public criticism, testimonials, partner commitments, and claims changes require a person.
8. **No in-process-only scheduling.** A protected worker/cron endpoint claims due jobs so work survives restarts and deployments.
9. **Relationship data is not outreach consent.** A follower, mutual, or followed account may be prioritized for human review, but no relationship status authorizes automated DMs, bulk outreach, or legal targeting.
10. **Raw exports are temporary inputs.** Instagram HTML exports must never be committed to Git, executed as HTML, or retained longer than the configured import-retention window.

## 3. Target operator experience

### Today

Show only the work requiring attention now:

- approvals due;
- failed or blocked sends/posts;
- legal-risk replies;
- hot partner leads;
- abandoned-check reminder exceptions;
- consent requests;
- daily performance anomaly;
- newly detected Instagram mutuals or high-confidence warm-audience candidates requiring review.

### Command

Show calm campaign movement:

- audience reached;
- email delivered/opened/clicked;
- check starts and completions;
- packet-ready and purchase events;
- social reach, saves, shares, comments, and profile/link actions;
- partner replies and meetings;
- QR scans by location/partner;
- proof candidates and approved testimonials;
- current recommendation and next best move;
- Instagram audience counts, recent relationship changes, mutuals, reviewed candidates, and outreach movement.

### Queue

One review desk for:

- content approval;
- creative approval;
- email test approval;
- scheduled external actions;
- reply/comment/DM review;
- partner outreach review;
- proof and consent review;
- failed jobs and integration health;
- Instagram audience-import exceptions, tagging review, and manual outreach candidates.

### Sources

Imports and source material:

- campaign workbook/CSV;
- contact-list staging and provider sync;
- brand/message house;
- approved claims and disclaimers;
- content bank;
- partner prospect files;
- Instagram followers/following HTML exports and synthetic test fixtures;
- product-event adapters;
- UTM and QR definitions.

### Settings

- channel connectors and advertised capabilities;
- email provider;
- Expungement.ai webhook signing;
- action gates;
- rate and frequency limits;
- suppression and consent policies;
- owner/admin/operator permissions;
- kill switches and diagnostics;
- audience-import retention, restricted-data access, confidence thresholds, and outreach suppression rules.

## 4. Core architecture

### 4.1 Domain modules

Add pure modules first. Keep side effects in connector and route layers.

```text
scripts/os-loops.mjs
scripts/marketing-event-contract.mjs
scripts/campaign-os.mjs
scripts/campaign-import.mjs
scripts/content-safety.mjs
scripts/campaign-segmentation.mjs
scripts/instagram-audience-import.mjs
scripts/audience-relationships.mjs
scripts/audience-candidate-scoring.mjs
scripts/email-campaigns.mjs
scripts/email-connectors.mjs
scripts/social-publishing.mjs
scripts/reply-triage.mjs
scripts/partner-distribution.mjs
scripts/utm-qr.mjs
scripts/campaign-metrics.mjs
scripts/proof-consent.mjs
scripts/job-outbox.mjs
scripts/job-runner.mjs
```

Extend existing modules rather than bypassing them:

```text
scripts/preview-server.mjs
scripts/storage.mjs
scripts/channel-connectors.mjs
scripts/daily-run-session.mjs
scripts/access-control.mjs
scripts/roles.mjs
scripts/auth-endpoint-hardening.mjs
scripts/rcap-revenue-os.mjs
```

### 4.2 Durable collections

Reuse existing `posts`, `postImages`, `publishEvents`, `socialAccounts`, `approvalQueue`, `contentBank`, and RCAP revenue collections. Add or formalize:

```text
campaigns
campaignBriefs
campaignContentItems
contentVariants
contentApprovals
campaignAssets
emailSequences
emailSteps
audienceSegments
audienceImportBatches
audienceProfiles
audienceRelationships
audienceTags
audienceOutreachStates
audienceImportErrors
contactProviderRefs
emailEnrollments
suppressionRecords
consentRecords
outboxJobs
jobAttempts
interactionEvents
replyCases
utmLinks
qrCodes
partnerShareKits
partnerOutreachRuns
proofCandidates
experiments
metricRollups
osLoopEvents
osLoopSnapshots
osLoopQueueItems
osLoopRegistryAudits
```

Every collection used in production must be included in the Supabase/core persistence allowlist and covered by a round-trip test.

### 4.3 Safe event envelope

All systems emit or are mapped into a common envelope:

```json
{
  "event_id": "evt_...",
  "source_system": "expungement_ai|email_provider|social_provider|instagram_export|command_center|partner|qr",
  "event_type": "consumer.check_started",
  "occurred_at": "ISO-8601",
  "received_at": "ISO-8601",
  "campaign_id": "cmp_...",
  "contact_ref_hash": "optional-hash",
  "partner_ref_hash": "optional-hash",
  "audience_ref_hash": "optional-hash",
  "content_item_id": "optional",
  "jurisdiction": "optional state code",
  "metrics": {},
  "summary": "operator-safe summary",
  "pii_classification": "none|redacted|aggregate_only",
  "visibility": "operator_only|internal_aggregate",
  "idempotency_key": "stable unique key",
  "raw_payload_stored": false
}
```

Initial event taxonomy:

```text
campaign.imported
audience.imported
audience.relationship_observed
audience.mutual_detected
audience.candidate_flagged
audience.outreach_reviewed
content.draft_generated
content.approved
social.publish_requested
social.published
social.publish_failed
social.comment_received
social.dm_received
email.enrolled
email.sent
email.delivered
email.opened
email.clicked
email.bounced
email.unsubscribed
email.complained
email.replied
consumer.check_started
consumer.check_abandoned
consumer.check_completed
consumer.result_created
consumer.packet_ready
consumer.purchase_completed
consumer.resume_requested
partner.prospect_scored
partner.outreach_approved
partner.reply_received
partner.meeting_booked
qr.scanned
proof.candidate_detected
proof.consent_requested
proof.consent_granted
proof.approved
integration.failed
```

Do not include charge descriptions, matter narratives, DOB, address, phone, raw email, raw Instagram handle/profile URL, Wilma transcripts, packet contents, payment identifiers, or provider payloads in the event store. Instagram handles may exist only in the restricted audience profile collection; loop events and cross-domain records use hashed references.

### 4.4 Outbox job model

Every external action becomes an outbox job:

```json
{
  "job_id": "job_...",
  "action_type": "email.send|social.publish|reply.send|webhook.sync",
  "provider": "configured adapter",
  "campaign_id": "cmp_...",
  "subject_ref": "internal reference",
  "scheduled_for": "ISO-8601",
  "approval_status": "not_required|pending|approved|rejected",
  "gate_status": "shadow|test|live",
  "status": "queued|claimed|running|succeeded|failed|cancelled|dead_letter",
  "idempotency_key": "stable key",
  "attempt_count": 0,
  "max_attempts": 5,
  "next_attempt_at": "ISO-8601",
  "last_error": "redacted",
  "created_by": "user/system",
  "audit": []
}
```

The worker claims due jobs with a lease, executes through an adapter, writes the result, and emits a normalized event. Duplicate execution must return the original outcome rather than create a second send/post.

## 5. Repository inspection baseline

The read-only inspection completed on `main` and found the following implementation facts:

- `scripts/preview-server.mjs` remains the single Node server and primary UI/API extension point.
- `scripts/storage.mjs` uses local JSON/Supabase core-record persistence.
- `coreStateCollections` is currently incomplete for collections already used by the server, UI, or tests. The inspection specifically identified omissions for `postImages`, `publishEvents`, RCAP revenue collections, `automationEvents`, `automationSuggestions`, `connectorStatus`, `googleInsights`, `complianceItems`, `campaignKits`, and `handoffContractPreviews`.
- `/api/events/product` currently writes to `automationEvents` and `automationSuggestions`; it is not yet the safe marketing-event envelope required by this plan.
- `scripts/channel-connectors.mjs` is primarily OAuth/readiness infrastructure, not yet a provider-neutral capability/action adapter.
- The UI contains an External Action Outbox concept, but no durable `outboxJobs` / `jobAttempts` execution model, lease model, or worker contract exists yet.
- `scripts/daily-run-session.mjs` should be extended for loop and audience Queue items rather than bypassed with a parallel workflow.
- `scripts/auth-endpoint-hardening.mjs` already provides external-action guards and should be extended with loop, audience-import, and outbox tripwires.
- The existing `package-lock.json` change removes only optional `libc` metadata from `sharp` native-package entries. It appears unrelated lockfile churn and must not be modified, normalized, or included in this build unless the owner resolves it separately.
- The root-level `LegalEase_OS_Growth_Automation_Build_Plan.md` is the authoritative plan input until intentionally moved.

No implementation should begin on a dirty `main` worktree. Use a clean dedicated feature branch or a clean worktree, preserving unrelated user changes.

## 6. Build phases

## Phase 0 — Baseline and persistence audit

**Estimated effort:** 2–4 engineering days

### Build

- Confirm the current production branch and whether the LegalEase OS event exporter is merged and deployed.
- Run all current tests and save a baseline report.
- Reconcile `coreStateCollections` against all existing RCAP, automation, connector, and proposed campaign collections.
- Add persistence round-trip tests before adding UI.
- Document current connector state and ensure all external gates remain off.
- Add an architecture decision record for PII separation, event contracts, outbox execution, and approval gates.
- Do not run `npm install` or otherwise rewrite the unrelated `package-lock.json` diff.
- Treat `lib/storage/migrations.mjs` as conditional: change it only if the persistence audit proves the existing core-record strategy requires it.

### Expected files

- `scripts/storage.mjs`
- `scripts/test-storage-durability.mjs`
- `scripts/test-state-integrity.mjs`
- `scripts/state-integrity.mjs`
- `scripts/os-health.mjs`
- `scripts/preview-server.mjs`
- An ADR such as `docs/adr/growth-automation-foundation.md`
- Possibly `lib/storage/migrations.mjs`, only if the audit proves it is necessary

### Acceptance

- Existing tests pass unchanged.
- RCAP and automation collections survive a Supabase-style read/write round trip.
- No new external action is possible.
- A diagnostics endpoint reports store, connector, gate, queue, and worker health without exposing secrets.

## Phase 1 — Loop foundation and internal Queue

**Estimated effort:** 4–6 engineering days

### Build

- Implement the normalized event contract, allowlist, redaction, signature verification, deduplication, and replay protection.
- Implement the loop registry with `shadow_mode: true` and `external_actions_enabled: false` defaults.
- Implement `osLoopEvents`, snapshots, Queue items, and audits.
- Add owner/admin protected event-ingest and diagnostics routes.
- Map loop outputs into Queue and Daily Run buckets.
- Add the outbox model in shadow mode; jobs can be created but not executed.

### Acceptance

- Unsupported/unsigned events are rejected.
- Obvious PII is rejected or redacted.
- Duplicate events do not create duplicate Queue cards.
- Partner-visible views cannot access consumer events.
- Active Daily Run snapshots remain stable.
- Every loop record is durable after restart/reload.
- The unrelated `package-lock.json` change remains byte-for-byte untouched and absent from the implementation diff.

### Expected files

- New `scripts/marketing-event-contract.mjs`
- New `scripts/os-loops.mjs`
- New `scripts/job-outbox.mjs`
- `scripts/storage.mjs`
- `scripts/preview-server.mjs`
- `scripts/daily-run-session.mjs`
- `scripts/auth-endpoint-hardening.mjs`
- `scripts/os-health.mjs`
- `scripts/state-integrity.mjs`
- New `scripts/test-marketing-event-contract.mjs`
- New `scripts/test-os-loops.mjs`
- New `scripts/test-job-outbox.mjs`
- New or extended `scripts/test-growth-automation-foundation.mjs`
- Updates as needed to `scripts/test-auth-endpoint-hardening.mjs`, `scripts/test-state-fetch-shape.mjs`, and `scripts/test-daily-run-session-brain.mjs`

## Phase 2 — Instagram audience import and warm-audience Queue

**Estimated effort:** 4–6 engineering days

### Purpose

Convert owner-supplied Instagram followers/following exports into a restricted, reviewable audience relationship dataset. This phase prepares warm-audience and partner-candidate work without scraping Instagram, inferring consent, or sending DMs.

### Current source baseline

The supplied Meta/Instagram exports contain:

- `followers_1.html`: 7,477 follower relationship entries;
- `following.html`: 827 followed-account relationship entries;
- 60 usernames present in both files, which should reconcile to mutual relationships.

These counts are acceptance fixtures for the first import, not permanent product constants.

### Build

- Add a protected Sources workflow called **Instagram Audience Import**.
- Support owner-supplied Meta HTML exports for `Followers` and `Following`.
- Parse files as inert documents with a safe DOM parser:
  - never render or execute uploaded HTML;
  - never load remote images, scripts, styles, or profile URLs;
  - enforce MIME, extension, byte-size, and structural limits;
  - reject malformed or unsupported export shapes with a clear import report.
- Canonicalize usernames and profile URLs without visiting profiles.
- Capture source relationship timestamps when present and preserve the export-generated/requested date range as import metadata.
- Create a preview before confirmation:
  - follower count;
  - following count;
  - mutual count;
  - duplicates;
  - invalid usernames/URLs;
  - parse failures;
  - relationship changes compared with the previous confirmed import.
- Add file-hash and batch idempotency so re-importing the same export does not duplicate profiles or relationships.
- Add restricted collections:
  - `audienceImportBatches`;
  - `audienceProfiles`;
  - `audienceRelationships`;
  - `audienceTags`;
  - `audienceOutreachStates`;
  - `audienceImportErrors`.
- Store raw usernames/profile URLs only in `audienceProfiles`, protected to owner/admin/operator roles. Use `audience_ref_hash` everywhere else.
- Delete or expire raw uploaded HTML after successful parsing according to a short retention policy. Store only file hash, source metadata, counts, warnings, and normalized restricted records.
- Reconcile relationship states:
  - follower only;
  - following only;
  - mutual;
  - no longer observed;
  - newly observed since prior import.
- Build review segments:
  - recent followers;
  - mutuals;
  - followers not followed;
  - followed accounts not following back;
  - potential partner/community accounts;
  - potential creator/trusted-messenger accounts;
  - low-confidence or likely spam accounts.
- Add explainable candidate tagging using username-only heuristics and imported relationship metadata. Every automated tag must display its reason and confidence and state that no bio, location, engagement history, or organizational verification was inspected.
- Add a manual **Warm Audience Queue** with:
  - username and profile link;
  - relationship state;
  - observed timestamp;
  - candidate category;
  - confidence and reason;
  - owner;
  - review status;
  - outreach status;
  - last human action;
  - suppression/never-contact flag;
  - notes.
- Do not add automated profile visits, scraping, follows, unfollows, comments, likes, or DMs.
- Add synthetic HTML fixtures to the repository. Add raw Instagram export filenames/patterns to `.gitignore` or a protected upload directory rule without committing the real exports.
- Surface aggregate import counts in Command and reviewed candidates in Queue/Daily Run.

### Expected files

- New `scripts/instagram-audience-import.mjs`
- New `scripts/audience-relationships.mjs`
- New `scripts/audience-candidate-scoring.mjs`
- New `scripts/test-instagram-audience-import.mjs`
- New `scripts/test-audience-relationships.mjs`
- New synthetic fixtures under a test-fixtures directory
- Extend `scripts/storage.mjs`
- Extend `scripts/preview-server.mjs`
- Extend `scripts/daily-run-session.mjs`
- Extend `scripts/auth-endpoint-hardening.mjs`
- Extend `scripts/state-integrity.mjs`
- Extend `scripts/os-health.mjs`
- Extend campaign segmentation/Queue rendering only where necessary

### Acceptance

- The current exports preview and confirm as exactly 7,477 followers, 827 following, and 60 mutuals.
- Re-importing identical files is idempotent.
- Importing a later export produces relationship-change records without deleting historical observations.
- Uploaded HTML is never executed and no remote network request is made during parsing.
- Real exports are not committed to Git and synthetic fixtures contain no real usernames.
- Raw handles/profile URLs never enter loop events, reports, partner views, or general campaign collections.
- Relationship status never implies marketing consent.
- No import can create or execute a DM, follow, unfollow, comment, like, email, or other external action.
- Candidate tagging is explainable, reversible, and human-reviewed before outreach.
- Owner/admin/operator access and audit tests pass.

## Phase 3 — Campaign model and source import

**Estimated effort:** 4–6 engineering days

### Build

- Add campaign, brief, message house, content item, email step, tactic, KPI, owner, and status schemas.
- Support CSV and XLSX import with preview, field mapping, validation, and rollback.
- Map the current Fresh Start workbook columns into the campaign model.
- Add claim provenance fields so nationwide, pricing, product, Wilma, and RCAP claims point to approved source notes.
- Create a campaign import report: counts, missing values, invalid dates, unsupported channels, duplicated content, missing CTA, missing disclaimer, and owner gaps.
- Add campaign cloning for future state, partner, or monthly variants.

### Acceptance

- The Fresh Start workbook imports as one campaign with 30 social items, 10 email steps, guerrilla tactics, DM templates, KPI targets, and source notes.
- Import creates drafts only.
- Invalid rows are shown before confirmation.
- Re-importing the same source is idempotent or produces a clear versioned update.

## Phase 4 — Content assembly, brand rules, and approvals

**Estimated effort:** 5–8 engineering days

### Build

- Create platform variants from each content spine without changing the core approved claim.
- Generate captions, hooks, carousel frames, short-video scripts, headlines, overlays, CTAs, and creative briefs.
- Add a LegalEase brand/claim linter:
  - prohibited guarantee language;
  - individualized eligibility conclusions;
  - legal-advice language;
  - unsupported statistics;
  - “relaunch” terminology;
  - price claims without packet-ready qualification;
  - missing “not a law firm / no legal advice / no guaranteed outcome” language where required.
- Add Wilma-use rules and force serious proof/legal-safety posts through a Wilma-free review path when appropriate.
- Add approval policies by content risk and channel.
- Build platform preview and campaign calendar views inside Queue/Command rather than new top-level navigation.

### Acceptance

- Every social item can generate approved channel variants and a creative brief.
- High-risk claims cannot become publishable without explicit owner approval.
- All changes retain version history and source claim references.
- Approval does not equal publish; the external action remains a separate gate.

## Phase 5 — Email provider, audience, and sequence engine

**Estimated effort:** 6–9 engineering days

### Build

- Create a provider-neutral email adapter:
  - sync/upsert contact;
  - create/update segment;
  - send test;
  - schedule approved message;
  - cancel scheduled message;
  - sync delivery/engagement events;
  - process unsubscribe, complaint, bounce, and reply events.
- Keep raw contact data in the ESP or a dedicated contact vault. Store provider IDs and hashed references in general OS records.
- Add contact-list staging, dedupe, opt-in source, suppression reconciliation, bounce hygiene, and personalization quality checks.
- Add segment rules for:
  - all active consumers;
  - non-openers;
  - clickers who did not start;
  - started but abandoned;
  - check completed but no packet;
  - packet ready;
  - purchaser suppression;
  - high-intent non-converters;
  - potential partner domains/replies;
  - monthly nurture.
- Implement sequence branches, send windows, frequency caps, quiet periods, test sends, owner approval, and stop conditions.
- Use “Hi there” until first names pass cleaning/confidence rules.

### Acceptance

- The ten-step Fresh Start sequence can run end-to-end in simulation.
- Non-openers can receive the approved alternate subject without duplicating the original send.
- Purchase, unsubscribe, complaint, hard bounce, and partner-reply events suppress the wrong next message.
- A test audience can receive test messages while live audience gates remain off.
- Every send has campaign, step, segment, UTM, consent/suppression decision, approval, and provider outcome records.

## Phase 6 — Expungement.ai event adapter and Consumer Completion Loop

**Estimated effort:** 5–8 engineering days

### Build

- Add a signed Expungement.ai exporter/webhook that sends only safe operational events.
- Map consumer progression into campaign-safe events:
  - started;
  - last safe stage;
  - abandoned;
  - completed;
  - broad result category;
  - packet ready;
  - purchase completed.
- Do not export case facts, answers, charge details, Wilma transcripts, or packet content.
- Add abandonment-window logic and a secure provider-side resume link/token.
- Create reminder recommendations first, then graduate approved low-risk reminders to automatic jobs.
- Add frequency limits and “do not contact” behavior across email and social reply systems.

### Acceptance

- A test check start creates one event and one campaign attribution record.
- An abandoned test creates one reminder recommendation after the configured delay.
- A resumed/completed/purchased user is suppressed from inappropriate reminders.
- The OS cannot infer or change legal eligibility.
- Webhook replay and tampering tests pass.

## Phase 7 — Social connector execution

**Estimated effort:** 6–10 engineering days, depending on connected-channel readiness

### Build

- Extend the social connector interface with a capability registry:
  - text;
  - image;
  - carousel;
  - short video;
  - scheduling;
  - comment ingest;
  - DM ingest;
  - metrics sync;
  - delete/cancel support.
- Unsupported capabilities remain manual and are labeled clearly.
- Implement media validation, upload, scheduling, retries, provider response storage, and metric sync.
- Add `shadow`, `test account`, `approval-required live`, and `limited auto` gates by channel/action.
- Add manual-publish fallback and proof capture when a connector cannot execute an item.
- Add pinned-post, story, live-event, and group-post actions as operator tasks unless a connector explicitly supports them.

### Acceptance

- Approved content can be scheduled and published to test/sandbox destinations without duplicate posts.
- Failed jobs retry safely and end in a visible dead-letter Queue item.
- A kill switch stops future claims immediately without losing the Queue.
- Manual-only actions remain visibly manual.
- Metrics map back to the exact content item and campaign.

## Phase 8 — Reply, comment, and DM triage

**Estimated effort:** 5–8 engineering days

### Build

- Ingest email replies and supported social comments/DMs.
- Classify into:
  - consumer starting-point question;
  - individualized legal/eligibility question;
  - technical support;
  - partner interest;
  - media/press;
  - testimonial/proof;
  - public criticism/reputation;
  - spam/abuse.
- Create response suggestions from approved templates.
- Auto-send only low-risk acknowledgments after a separate activation gate.
- Force legal-risk, partner commitment, testimonial, public criticism, and ambiguous items to humans.
- Add ownership, SLA, status, notes, and resolution reason.

### Acceptance

- 100% of legal-risk test messages route to human review.
- No suggested response makes an eligibility or outcome claim.
- Partner interest creates a partner lead and owner alert.
- Testimonial language creates a proof candidate, not an immediately publishable post.
- Replies are never lost when provider synchronization repeats.

## Phase 9 — Partner Distribution and guerrilla workflow

**Estimated effort:** 5–8 engineering days

### Build

- Extend RCAP revenue records with campaign attribution and partner-distribution stages.
- Add prospect import/enrichment adapter, fit scoring, suppression, duplicate detection, and recommended offer/share kit.
- Generate personalized partner email/DM drafts with the first sentence requiring human review for cold outreach.
- Add share-kit generation:
  - one-line description;
  - approved disclaimer;
  - social caption;
  - flyer copy;
  - QR code;
  - co-branded mockup request;
  - office-hours invite.
- Add QR/location/partner attribution and scan events.
- Add office-hours tasks, reminders, attendance, questions, and pilot follow-up.
- Pause sequences on reply, booking, form submission, opt-out, or owner action.

### Acceptance

- The system can prepare the daily 25-partner outreach Queue without sending it automatically.
- Every share kit has a unique UTM/QR attribution path.
- A partner reply stops future scheduled touches and creates a human follow-up.
- Duplicate organizations/contacts are suppressed.
- Pricing, scope, contracts, and pilot commitments remain human-controlled.

## Phase 10 — Metrics, attribution, experiments, and recommendations

**Estimated effort:** 5–8 engineering days

### Build

- Create a normalized interaction-event and metric-rollup pipeline.
- Attribute email, social, partner, and QR activity to campaign/content/segment/partner.
- Build funnel views:
  - delivered/reached;
  - opened/viewed;
  - clicked/scanned;
  - check started;
  - check completed;
  - packet ready;
  - purchase;
  - partner reply;
  - meeting/pilot.
- Add experiment definitions for subject lines, hooks, formats, CTAs, send windows, and partner approaches.
- Add minimum sample thresholds and prohibit automatic “winner” declarations from tiny samples.
- Generate daily anomaly alerts and a weekly performance recommendation card.
- Support a public-safe weekly metric subset that excludes sensitive consumer details.

### Acceptance

- Dashboard totals reconcile with provider and product test exports.
- Every conversion can be attributed or marked unattributed; none is silently invented.
- The OS proposes a next-best content/action change but does not rewrite approved future content without review.
- Weekly reports are reproducible from stored events and rollups.

## Phase 11 — Proof, UGC, and consent

**Estimated effort:** 3–6 engineering days

### Build

- Detect proof candidates from positive replies, partner shares, filing confirmations, and outcome reports.
- Add consent state and approved-use scope:
  - internal proof only;
  - anonymized marketing;
  - named marketing;
  - partner case study;
  - investor/data room.
- Add redaction review and sensitive-fact warnings.
- Generate draft proof cards, thank-you posts, and case-study outlines.
- Route approved proof into the content bank and partner follow-up loop.

### Acceptance

- Nothing becomes public proof without recorded affirmative consent and owner approval.
- Revoked consent removes future scheduled use and flags already-published assets for review.
- Sensitive details are not copied from consumer product records into marketing records.

## Phase 12 — Activation, hardening, and runbooks

**Estimated effort:** 4–7 engineering days

### Build

- Implement action gates by environment, channel, campaign, action type, segment, and risk level.
- Add rate limits, frequency caps, quiet periods, global suppression, partner suppression, and per-channel kill switches.
- Add lease recovery, dead-letter review, replay tooling, and provider outage behavior.
- Add audit export and evidence records for every approval and external action.
- Write runbooks:
  - campaign launch;
  - stop all sending;
  - stop one channel;
  - provider outage;
  - duplicate-send incident;
  - bad claim/public correction;
  - unsubscribe/complaint spike;
  - webhook failure;
  - PII exposure response.
- Add a controlled production activation checklist requiring owner confirmation.

### Acceptance

- One control stops all external jobs immediately.
- No gate can be enabled by a viewer or partner role.
- A failed provider cannot cause an uncontrolled retry storm.
- Full dry run, test-audience launch, limited live cohort, and rollback exercises pass.
- Security, persistence, product, social, email, and generated-client regression tests pass.

## 7. Automation promotion ladder

### Level 0 — Draft only

The OS prepares content, sequences, partner messages, reply suggestions, and reports.

### Level 1 — Approved Queue

The OS schedules internal jobs and shows exactly what will happen, but external actions remain disabled.

### Level 2 — Human-approved execution

A person approves each send/post or a bounded batch. The worker performs the provider call and records the result.

### Level 3 — Low-risk automatic execution

Only approved categories may run automatically:

- transactional campaign event synchronization;
- metrics synchronization;
- suppression processing;
- approved abandonment reminders;
- approved sequence steps;
- approved scheduled social posts;
- low-risk acknowledgment messages.

### Level 4 — Always human

Never promote these to unattended execution:

- individualized legal or eligibility responses;
- court-outcome predictions;
- public criticism or crisis response;
- testimonial publication and consent decisions;
- partner price, contract, scope, or pilot commitments;
- legal-rule/packet/eligibility changes;
- consumer-level data exports to partners.

## 8. Required tests

### Storage and durability

- Every new collection survives the production persistence round trip.
- Outbox leases recover after process termination.
- Retries do not duplicate sends/posts.

### Security and privacy

- Unsigned/spoofed events are rejected.
- Replay attempts are idempotent.
- PII patterns and forbidden keys are rejected from loop events.
- Consumer events are operator-only.
- Partner users cannot access internal campaign or consumer telemetry.

### Campaign import

- CSV and XLSX supported.
- Required fields validated.
- Dates/time zones normalized.
- Unsupported platforms clearly marked.
- Duplicate imports/version changes handled.

### Instagram audience import

- Uploaded HTML is parsed inertly and never executed.
- No network request is made for profile links or embedded assets.
- File hash, batch idempotency, canonicalization, and duplicate handling work.
- Current fixture counts reconcile to 7,477 followers, 827 following, and 60 mutuals.
- Relationship changes are historical and reversible.
- Raw handles are restricted; loop/event records use hashed references.
- Candidate tags include reason and confidence.
- Relationship status never bypasses outreach review, suppression, or consent rules.
- Real export files are rejected from fixture/commit paths.

### Email

- Suppression beats enrollment.
- Purchase/resolution stops inappropriate nurture.
- Unsubscribe/complaint is immediate and global as configured.
- Non-opener resend does not duplicate recipients.
- Name fallback works.
- Frequency caps and quiet periods work.

### Social

- Approval is required according to gate.
- Provider capability mismatches fall back to manual tasks.
- Media validation and size/type failures are visible.
- Duplicate publish is prevented.

### Reply triage

- Legal-risk messages always escalate.
- No response template gives legal advice or a guarantee.
- Partner interest routes correctly.
- Testimonial candidates require consent.

### Metrics

- Provider totals reconcile.
- Attribution is deterministic.
- Unknown attribution is labeled unknown.
- Small samples do not trigger autonomous optimization.

## 9. Release plan and planning estimate

Assumption: one senior full-stack engineer using coding agents, with access to existing OS and product repositories. Provider approvals and account setup can extend calendar time.

| Release | Scope | Planning estimate |
|---|---|---:|
| R0 | Baseline, persistence, loop foundation | 1–2 weeks |
| R1 | Instagram audience import + warm-audience Queue | 1 week |
| R2 | Campaign import, content production, approvals | 2 weeks |
| R3 | Email provider + Consumer Completion Loop | 2–3 weeks |
| R4 | Social execution + reply triage | 2–3 weeks |
| R5 | Partner distribution, QR, metrics, proof | 2 weeks |
| R6 | Hardening and production activation | 1 week |

**Practical total:** approximately 9–13 weeks for a controlled full build. A useful shadow-mode OS with a reconciled Instagram warm-audience Queue and campaign drafts can be available after roughly 4–5 weeks. With two engineers working cleanly in parallel after the foundation, the full calendar can compress, but the activation and safety gates should not be skipped.

## 10. First production milestone

The first milestone should not be “the OS posts and emails automatically.” It should be:

1. Complete the persistence and loop foundation on a clean feature branch/worktree.
2. Import the Instagram followers/following exports as restricted data.
3. Reconcile 7,477 followers, 827 following, and 60 mutuals and create a manual Warm Audience Queue.
4. Import the Fresh Start workbook.
5. Create the 30 social items, 10 email steps, tactics, scripts, KPIs, and source notes.
6. Generate all content/creative variants.
7. Create one clean approval Queue spanning content, audience review, and partner tasks.
8. Sync the email audience to an ESP in test mode.
9. Receive safe Expungement.ai test events.
10. Simulate the full 30-day campaign with no external actions.
11. Produce the exact sends, posts, reminders, partner tasks, audience-review tasks, and reports the OS would execute.
12. Review the simulation and only then activate a small test cohort.

## 11. Definition of done

The Growth Automation build is complete when Roger can:

- import Instagram followers/following exports, reconcile relationship states, and review a warm-audience Queue without scraping or automated outreach;
- import a campaign and list without manual post-by-post setup;
- review one coherent Queue of content, email, reply, partner, proof, and failure items;
- approve bounded batches while seeing the exact action and audience;
- run the ten-email sequence with behavior-based branches and suppression;
- trigger safe abandonment/resume reminders from Expungement.ai events;
- schedule/publish approved supported social content and track manual fallbacks;
- triage replies/comments/DMs without autonomous legal answers;
- prepare and track partner/grassroots outreach with QR attribution;
- see a reconciled funnel from reach to check to packet/purchase and partner movement;
- capture proof only with consent;
- stop all external action immediately;
- audit who approved and what the OS did for every external action.

## 12. Recommended first Codex mission

```text
Mission: Build the LegalEase OS Growth Automation foundation in shadow mode.

Repository:
/Users/rogerroman/Dev/legalease-command-center

Do not enable email, social publishing, DMs, calendar writes, or any other external action.
Do not alter Expungement.ai eligibility, matter, Briefcase, packet, Wilma, or Stripe logic.
Keep all live gates at 0.

Implement only Phase 0 and Phase 1. Use the completed inspection as the baseline.

Before editing, work from a clean dedicated feature branch or clean worktree. Preserve the unrelated package-lock.json metadata change and the plan file; do not normalize, stage, or include that lockfile diff. If a clean branch/worktree is not available, stop and report rather than modifying `main`.

Run the current full test suite once before editing and save the baseline result. Tests were not run during the read-only inspection.

1. Reconcile scripts/storage.mjs coreStateCollections. At minimum verify/fix persistence for postImages, publishEvents, all RCAP revenue collections, automationEvents, automationSuggestions, connectorStatus, googleInsights, complianceItems, campaignKits, handoffContractPreviews, and every newly added foundation collection. Add production-style round-trip tests.
2. Add scripts/marketing-event-contract.mjs with:
   - normalized event allowlist;
   - redaction/rejection of PII and forbidden payloads;
   - idempotency key generation;
   - signature/replay verification helpers.
3. Add scripts/os-loops.mjs with a shadow-only registry and severity evaluation.
4. Add persisted collections:
   - osLoopEvents
   - osLoopSnapshots
   - osLoopQueueItems
   - osLoopRegistryAudits
   - outboxJobs
   - jobAttempts
5. Add owner/admin protected diagnostics and event-ingest routes in preview-server.mjs.
6. Surface internal-only loop review cards in Queue and appropriate Daily Run buckets.
7. Add hard tripwires proving no registry or job can define or execute send, email, publish, DM, calendar, file, legal-rule, packet, or eligibility actions.
8. Add tests for persistence, auth, redaction, idempotency, replay, Queue dedupe, Daily Run snapshot stability, and no external actions.
9. Run the full existing test suite and return:
   - files changed;
   - tests run and results;
   - persistence audit findings;
   - security findings;
   - exact next patch for Phase 2.

Do not deploy. Do not run migrations. Do not modify environment variables or OAuth settings.
```


## 13. Recommended second Codex mission — Instagram audience import

Run this only after Phase 0 and Phase 1 pass, are reviewed, and exist on a clean branch based on the accepted foundation.

```text
Mission: Add the Instagram Audience Import phase to LegalEase OS in shadow/manual-review mode.

Repository:
/Users/rogerroman/Dev/legalease-command-center

Authoritative plan:
LegalEase_OS_Growth_Automation_Build_Plan.md
(use the Version 2 file copied to that root-level name)

Implement only Phase 2 — Instagram audience import and warm-audience Queue.

Inputs for local acceptance only:
- following.html
- followers_1.html

The real export files are private operator inputs. Do not commit, copy into fixtures, publish, or expose them through public routes.

Build:

1. Add a protected Sources workflow named Instagram Audience Import.
2. Parse Meta/Instagram Followers and Following HTML exports as inert documents.
3. Never execute HTML, scripts, styles, remote images, or links; make no network requests.
4. Add file-size/type/structure validation and an import preview.
5. Canonicalize usernames and profile URLs.
6. Add file-hash and import-batch idempotency.
7. Persist restricted collections:
   - audienceImportBatches
   - audienceProfiles
   - audienceRelationships
   - audienceTags
   - audienceOutreachStates
   - audienceImportErrors
8. Reconcile follower-only, following-only, mutual, newly observed, and no-longer-observed states.
9. Use raw handles/profile URLs only in restricted audienceProfiles. Use audience_ref_hash in loops, reports, Queue references, and cross-domain records.
10. Add explainable username-only candidate tags with confidence and reason. Mark them unverified until a human reviews them.
11. Add a manual Warm Audience Queue with owner, review state, outreach state, last human action, suppression, and notes.
12. Add aggregate counts to Command and due review items to Queue/Daily Run.
13. Add synthetic fixtures with fake usernames. Add rules that prevent real Instagram exports from being committed.
14. Add auth, audit, persistence, parser-security, idempotency, relationship-reconciliation, and no-external-action tests.

Acceptance against the supplied local exports:

- followers_1.html previews and confirms 7,477 follower records.
- following.html previews and confirms 827 following records.
- reconciliation produces 60 mutual relationships.
- identical re-import creates no duplicate profiles or relationships.
- no network request occurs.
- no uploaded HTML executes.
- no raw handle appears in osLoopEvents, general campaign records, partner-visible data, or public state.
- no DM, follow, unfollow, comment, like, email, post, or provider action is created or executed.
- relationship state never implies consent.
- candidate tags remain reviewable and reversible.
- all existing and new tests pass.

Do not implement campaign import, email sending, social publishing, profile scraping, automated outreach, or provider activation.
Do not modify Expungement.ai eligibility, matter, Briefcase, packet, Wilma, payment, or Stripe logic.
Do not deploy, migrate, modify OAuth/environment/secrets, commit, push, or open a PR unless separately instructed.

Return:
- files changed;
- tests run and results;
- import preview counts;
- parser/security findings;
- persistence findings;
- exact next patch for the campaign model phase.
```
