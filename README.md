# LegalEase Command Center

Local operating system for the LegalEase six-month growth sprint and social production workflow.

## Keep The App Visible

Use the double-click launcher:

- `Start-LegalEase.command` starts the local server in the background and opens `http://127.0.0.1:3001/#queue`.
- `Keep-LegalEase-Visible.command` keeps a small watcher open and restarts the app if it stops.

Terminal options:

```bash
npm run local:start
npm run local:status
npm run local:restart
npm run local:stop
npm run local:keepalive
```

Runtime files live in `.local/` and are ignored by git:

- `.local/preview-server.pid`
- `.local/preview-server.log`

## Clean Investor Demo Dataset

Use this when the demo state gets noisy:

```bash
npm run demo:load
npm run local:restart
```

The demo dataset backs up the current JSON state under `data/backups/demo-dataset/`, then loads a compact investor story:

- 7 six-month milestones
- 6 qualified partner records
- 5 campaign records
- 3 pilot records
- 5 social queue/posts
- 12 data room artifacts
- 3 RecordShield funnel snapshots
- 2 automation suggestions

The story is: LegalEase is turning partner distribution into RecordShield users, proving RecordShield to Expungement.ai conversion, and packaging institutional proof for investors/acquirers.

## 9.5 Growth Operating Layer

The Growth Command Center now includes a proof-point system that tracks the investor/acquirer readiness narrative across:

- signed institutional pilots
- RecordShield users
- RecordShield to Expungement.ai conversion
- active partner campaigns
- public institutional proof
- infrastructure dashboard readiness
- compliance safety
- acquisition/data-room readiness

Overview shows a derived 0 to 9.5 readiness score, proof cards, blocked growth, next best actions, product-event capture, automation inbox counts, funnel health, partner pipeline, data room readiness, and social production status.

## Enforcement Rules

The app surfaces orphan data and blocks weak operating states:

- partners need owner, qualification inputs, next action, and next follow-up
- campaigns marked live are downgraded to blocked if launch gates are missing
- pilots marked active/live are downgraded if launch gates are missing
- high-risk unresolved compliance items block launch readiness
- data room artifacts are scored and flagged when stale
- next best actions are generated from partner, campaign, pilot, funnel, compliance, data room, milestone, task, and automation state

## Product Event Webhook

`POST /api/events/product` accepts signed server-side product events from RecordShield, Expungement.ai, landing pages, and future products.

Required server-side env var:

```txt
PRODUCT_EVENT_WEBHOOK_SECRET=
```

Send the secret with either:

```txt
x-product-event-secret: <secret>
```

or:

```txt
Authorization: Bearer <secret>
```

Unsigned or invalid events fail closed. Raw payload metadata is redacted for obvious PII/legal-detail keys before storage. Events create Automation Inbox entries and funnel update suggestions for human approval.

## Google Workspace Read-Only Foundation

Settings includes a Google Workspace section, and Automation Inbox includes manual sync buttons for Gmail and Google Calendar. These are server-side, read-only syncs:

- Gmail reads recent matching messages from the last 14 days.
- Calendar reads recent/upcoming matching meetings from the last 14 days through the next 30 days.
- Sync creates Automation Inbox events and suggestions.
- Sync also creates draft/internal Growth Inbox items, Tasks, COO Brief inputs, and Evidence Pack notes when the signal matters.
- No emails are sent or modified.
- No calendar events are created or modified.
- Tokens are never sent to the browser.
- Stored OAuth tokens are encrypted server-side with `OAUTH_TOKEN_ENCRYPTION_KEY`.

Supported server-side env vars:

```txt
OAUTH_TOKEN_ENCRYPTION_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
APP_BASE_URL=
GMAIL_ACCESS_TOKEN=
GOOGLE_GMAIL_ACCESS_TOKEN=
GOOGLE_CALENDAR_ACCESS_TOKEN=
CALENDAR_ACCESS_TOKEN=
GOOGLE_ACCESS_TOKEN=
GOOGLE_CALENDAR_ID=
```

Preferred setup is the Google OAuth button in Settings or Automation Inbox. If `GOOGLE_REDIRECT_URI` is not set, hosted mode derives the callback from `APP_BASE_URL` as `/api/oauth/google_workspace/callback`. The direct access-token env vars are fallback/dev options only. If tokens are missing, sync fails closed and records the connector error in the Automation Inbox status panel.

Diagnostics:

```bash
GET /api/google-workspace/diagnostics
POST /api/google-workspace/disconnect
```

Diagnostics return safe status only: configuration, callback URL, connected account name, sync timestamps, and whether encrypted tokens exist. They never return token values.

## Local Notes

Live social posting remains gate-controlled and disabled unless the relevant live posting env gates and credentials are explicitly configured. Secrets must stay server-side only.

## SOC 2 Readiness Module

Open the SOC 2 area in the app at `#soc2`. The supporting pages are:

- `#soc2-access`
- `#soc2-audit`
- `#soc2-changes`
- `#soc2-vendors`
- `#soc2-incidents`
- `#soc2-evidence`
- `#soc2-policies`

Run the local verification bundle with:

```bash
npm run verify
```

This runs the meaningful checks that match the current architecture:

- `node --check scripts/preview-server.mjs`
- `node --check scripts/storage.mjs`
- `node --check scripts/priority-engine.mjs`
- `node --check scripts/prepare-launch-demo.mjs`
- `npm audit --audit-level=high`

The LE Operating System includes a lightweight SOC 2 Readiness area. It does not claim LegalEase is SOC 2 compliant. It helps the team operate like an auditable company by tracking access reviews, audit logs, change management, vendor inventory, incident records, evidence, and core policies.

The module supports the SOC 2 trust service categories of Security, Availability, Processing Integrity, Confidentiality, and Privacy. It is built for readiness and evidence collection only; a formal Type I or Type II report requires review by a qualified auditor.

Core pages:
- Compliance Dashboard: readiness score, readiness band, open gaps, evidence quality, control owners, Type I checklist, overdue reviews, incidents, changes, monthly evidence, control-area readiness, weakest control area, and AI governance checks.
- Access Reviews: users, roles, systems, access levels, owners, and review status.
- Audit Logs: sensitive actions with actor, resource, before/after values, IP, and user agent when available.
- Change Management: product, infrastructure, prompt, AI workflow, database, and deployment changes with rollback plans.
- Vendor Inventory: Supabase, OpenAI, Google, hosting, analytics, contractors, and agencies by data access and risk.
- Incident Register: security, privacy, availability, data, AI-output, and operational incidents.
- Evidence Center: timestamped evidence records, review status, quality, source reliability, renewal cadence, reviewer notes, and monthly collection tracking.
- Policies: concise startup-grade policy records, including AI Governance and Access Control.

Monthly evidence snapshots:
- `GET /api/soc2/evidence-snapshot` returns the current monthly readiness snapshot as JSON.
- `GET /api/soc2/evidence-snapshot/export` returns a Markdown artifact named `legalease-soc2-readiness-snapshot-YYYY-MM.md`.
- The dashboard button **Generate Monthly Evidence Snapshot** creates an Evidence Center record titled `SOC 2 Readiness Snapshot - [Month Year]` and links it to the Markdown export.
- The dashboard button **Export Markdown Snapshot** downloads or opens the current Markdown snapshot.
- Local Markdown files are written under `data/exports/soc2/` when the export endpoint runs.
- A snapshot is an internal operating artifact. It shows readiness score, score band, control counts, overdue reviews, open incidents, unresolved high-risk vendors, high-risk changes without approval, policies due for review, evidence quality, evidence review status, overdue evidence collection, control owners, Type I checklist status, missing evidence areas, audit highlights, and Type I / Type II readiness gaps.
- This artifact is meant for internal review, diligence requests, and later upload into tools such as Vanta, Drata, Secureframe, Google Drive, or an auditor portal.
- This artifact is readiness evidence only. It is not certification, attestation, audit completion, or proof of SOC 2 compliance.

Evidence review workflow:
- Evidence records move through `Draft`, `Ready for Review`, `Approved`, `Rejected`, and `Archived`.
- Each record can capture reviewer, reviewed date, review notes, control area, evidence period, evidence quality, source reliability, renewal frequency, and next collection due date.
- Evidence quality uses `Weak`, `Acceptable`, and `Strong`. Source reliability uses `Manual`, `System Generated`, `Third Party`, and `Automated Log`.
- Review actions create audit log entries for ready-for-review, approval, rejection, archive, quality changes, and next-due-date changes.

Control owners and score bands:
- Control areas map to an owner, backup owner, review cadence, last reviewed date, next review due date, status, and notes.
- The readiness score now considers control status, evidence quality, overdue access reviews, open incidents, high-risk vendor review gaps, policies due for review, missing control owners, and overdue evidence collection.
- Score bands are `0-39 Not Ready`, `40-69 Building Foundation`, `70-84 Approaching Type I Readiness`, and `85-100 Strong Readiness Posture`.

Type I readiness checklist:
- The dashboard and Markdown export include a practical Type I checklist covering access control, access inventory, review cadence, change management, high-risk change approval, vendor inventory, high-risk vendor review, incident response, evidence collection, AI governance, human approval for sensitive AI workflows, data retention, security policy, monthly snapshot export, and audit logging.
- The checklist is readiness scaffolding for a future auditor conversation. A qualified auditor still needs to review control design, evidence sufficiency, and scope.

What SOC 2 Readiness does:
- helps LegalEase collect operational evidence early
- maps records into control areas
- tracks AI governance changes and approvals
- surfaces overdue reviews, open incidents, and missing evidence
- creates auditable internal records for sensitive operational changes

What SOC 2 Readiness does not do:
- it does not certify LegalEase as SOC 2 compliant
- it does not replace an auditor
- it does not guarantee control design or operating effectiveness
- it does not prove Type I or Type II readiness on its own

Remaining gaps before Type I readiness:
- finalize formal control narratives and ownership
- document production infrastructure and access boundaries more completely
- complete policy approvals and review cadence
- collect stronger evidence across every control area
- validate incident response, change approval, and vendor review procedures in practice

Remaining gaps before Type II readiness:
- operate the controls consistently across a real observation period
- preserve evidence month after month without gaps
- show repeated access reviews, approvals, incident handling, and change management history
- tighten AI governance evidence around prompts, model/provider changes, output approvals, and automation actions

Sensitive local changes made through the shared growth/SOC 2 save route append audit log records. Secrets are not displayed in the browser and service keys remain server-side only.

## Render + Supabase Hosting Readiness

The Command Center can now run in two modes:

- Local/demo mode: `LOCAL_DEMO_MODE=true` and `STORAGE_BACKEND=json`. This keeps using `data/social-command-center.json` and local export folders for development.
- Hosted mode: `LOCAL_DEMO_MODE=false` and `STORAGE_BACKEND=supabase`. Render runs the Node app and Supabase stores core operating records.

Local state and seed data:

- `data/social-command-center.json` is local working state and is intentionally not committed. It can be large because it may contain generated image metadata, audit history, and local operating data.
- Fresh clones bootstrap local/demo mode from `data/seed/social-command-center.seed.json`.
- If `data/social-command-center.json` already exists, local/demo mode uses it and does not overwrite it.
- Supabase is the production source of truth in hosted mode. Local JSON is a development fallback and migration source only.
- To test a clean local bootstrap without touching your real data, set `COMMAND_CENTER_DATA_PATH` and `COMMAND_CENTER_SEED_PATH` to temporary files.

Runtime environment variables:

```bash
APP_BASE_URL=https://your-render-app.onrender.com
LOCAL_DEMO_MODE=false
STORAGE_BACKEND=supabase
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=social-assets
SUPABASE_CORE_RECORDS_TABLE=leos_core_records
OAUTH_TOKEN_ENCRYPTION_KEY=
ENABLE_LIVE_LINKEDIN_POSTING=false
ENABLE_LIVE_FACEBOOK_POSTING=false
ENABLE_LIVE_INSTAGRAM_POSTING=false
ENABLE_LIVE_X_POSTING=false
ENABLE_LIVE_TIKTOK_POSTING=false
ENABLE_LIVE_THREADS_POSTING=false
```

Before enabling hosted mode, run `supabase/leos-core-records.sql` in Supabase. It creates `public.leos_core_records`, a JSONB core-record table keyed by `collection` and `item_id`. No public RLS policy is created; the app uses the service role key server-side only.

Core state currently synced to Supabase includes content bank records, approval queue, posts, priorities, blockers, campaigns, partners, pilots, data room items, metrics, system health, reports, funnel snapshots, activity events, and audit history/SOC 2 audit logs.

To migrate local data into Supabase without deleting local data:

```bash
npm run migrate:supabase
```

The migration reads `data/social-command-center.json`, upserts core records into `leos_core_records`, and writes a report under `data/exports/reports/`.

Production health check:

```bash
curl https://your-render-app.onrender.com/api/health
```

`/api/health` returns app status, active storage backend, Supabase DB/storage connection status, OpenAI configured status, and live-gate count. It never returns secret values.

Weekly Evidence Pack export behavior:

- The Weekly Evidence Pack is an internal operating artifact for investor, partner, and leadership proof. It pulls from events, completed tasks, partner movement, campaign movement, RecordShield funnel snapshots, approved/published content, support learnings, revenue/pipeline notes, autonomy actions, and SOC 2 Readiness signals.
- Report sections include Executive Takeaway, What Changed This Week, Growth Signals, Partner Movement, Campaign Movement, RecordShield Funnel, Revenue / Pipeline Notes, Customer / Support Learnings, Content and Distribution, Compliance / Risk Notes, Proof Points for Investors, and Next Week Priorities.
- Actions available from Reports: Generate Draft, Save to Data Room, Export Markdown, Export JSON, and Export to Supabase Storage.
- Local/demo mode writes Markdown and JSON under `data/exports/reports/` for export actions.
- Hosted Supabase mode uploads Markdown and JSON to Supabase Storage under `reports/` for hosted exports and stores the public URLs on the report record.
- Evidence packs are draft/internal until reviewed. They do not send emails, publish content, claim audited compliance, promise eligibility, or imply guaranteed legal outcomes.

Render deployment:

- `render.yaml` is included as a starting point.
- Build command: `npm install`
- Start command: `npm run start:production`
- Health check path: `/api/health`
- Runtime binding: local development binds to `127.0.0.1`; Render/production binds to `0.0.0.0` and uses `process.env.PORT`.

Production verification:

```bash
npm run verify:production
```

The production verifier checks syntax, npm audit, health endpoint behavior, Supabase/OpenAI readiness reporting, secret exposure prevention, live-gate status, autonomy rules, SOC 2 snapshot access, and fail-closed live publishing policy. By default it runs in local fallback mode. Set `VERIFY_HOSTED_MODE=true` when validating a hosted Supabase-mode environment.

End-of-build checklist: confirm the command surfaces against hosted Supabase state before treating a build as production-ready.

Hosted access control:

- Local JSON fallback remains open for development.
- Hosted Supabase mode requires a role token unless `COMMAND_CENTER_AUTH_DISABLED=true` is explicitly set.
- Supported role tokens:
  - `COMMAND_CENTER_OWNER_TOKEN`
  - `COMMAND_CENTER_ADMIN_TOKEN`
  - `COMMAND_CENTER_MARKETING_TOKEN`
  - `COMMAND_CENTER_REVIEWER_TOKEN`
  - `COMMAND_CENTER_PARTNER_TOKEN`
  - `COMMAND_CENTER_INVESTOR_TOKEN`
  - `COMMAND_CENTER_COMPLIANCE_TOKEN`
- Clients pass the token via `Authorization: Bearer ...`, `x-command-center-token`, or the `leos_session` cookie.
- Unauthorized hosted requests fail server-side and create Access Control audit evidence.

Production runbook:

```txt
docs/PRODUCTION_RUNBOOK.md
```

The runbook covers deploy, rollback, health checks, key rotation, disabling live publishing, restore discipline, migration, report exports, OAuth debugging, secret exposure checks, evidence regeneration, and emergency shutdown.

Still required before real production use:

- Create and verify the Supabase core records table.
- Confirm Supabase Storage bucket `social-assets` is public and writable by the service role key.
- Set a strong `OAUTH_TOKEN_ENCRYPTION_KEY` before connecting OAuth accounts.
- Keep every `ENABLE_LIVE_*_POSTING` gate false until channel dry runs pass.
- Review backup/restore behavior for hosted mode; local file backups are still primarily a dev/local tool.

## Autonomy Layer

The Command Center now includes a lightweight autonomy layer under `#autonomy`.

The goal is operational leverage, not uncontrolled automation. The engine classifies work into four lanes:

- Automatic: routine internal, reversible work such as refreshing priorities and creating follow-up tasks.
- Needs decision: public-facing or medium-risk actions such as image uploads, approvals, or automation suggestions.
- Hard review: legal, compliance, security, financial, or high-risk actions.
- Forbidden: email sending, live publishing, pricing changes, material legal-policy changes, secret exposure, destructive database actions, RLS weakening, audit-log removal, and legal/outcome promises.

Useful endpoints:

```bash
GET /api/autonomy/status
POST /api/autonomy/run
POST /api/autonomy/actions/:id/approve
POST /api/autonomy/actions/:id/block
POST /api/autonomy/actions/:id/ignore
```

`POST /api/autonomy/run` only executes safe internal actions. It does not send email, publish to social media, change pricing, change legal policy, expose secrets, or run destructive database operations. Every autonomy run writes SOC 2 audit evidence and activity events.

The Overview page shows a compact Autonomy panel so Roger can see what happened automatically, what needs a decision, what needs hard review, and what the system refused to run.

## Growth Inbox

The Growth Inbox lives at `#growth-inbox`. It is the daily intake surface for raw company signals: meeting notes, partner updates, investor notes, customer/support issues, content ideas, campaign ideas, pilot updates, revenue/pipeline updates, and compliance concerns.

Workflow:

1. Paste raw text into Growth Inbox.
2. The server creates a structured inbox item and classifies source type, risk, priority, suggested action, and destination.
3. Optional OpenAI triage runs server-side when configured; failures fall back to rule-assisted triage.
4. Roger converts the item into a task, Content Bank idea, partner update, campaign update, support issue, or evidence-pack note.
5. Ignored items require a reason.

Growth Inbox never sends emails, never publishes, never enables live gates, and never turns high-risk legal/compliance content into external output without human review. Created, triaged, converted, and ignored events are written to operating memory for COO Briefs and evidence packs.

## Tasks and Escalations

The Tasks page lives at `#tasks`. It turns recommendations, blockers, and stale operating records into owned work with owner, status, priority, due date, source link, risk level, next action, escalation reason, and history.

Task views:

- Today
- Overdue
- Waiting on Roger
- Blocked
- Partner Follow-Up
- Investor Proof
- Compliance Review
- Content Production

`Rebuild Tasks` scans the current operating state and creates missing escalation tasks for stale partners, campaigns without weekly movement, blocked approvals, missing Friday evidence packs, high-risk content waiting more than 48 hours, stale pilots, high-priority Growth Inbox items, and high-severity support issues. Existing open tasks are de-duplicated by escalation key.

Task actions are local/Supabase persisted and event logged:

- Mark done
- Snooze
- Assign owner
- Dismiss with reason
- Convert to report note
- Convert to content idea

Tasks do not send emails, publish, or change live gates.

## Partner Lifecycle Automation

Partners now operate as lifecycle records, not static CRM notes. Each partner can track type, stage, owner, next action, next action due date, last touch date, priority, revenue potential, proof value, risk level, related campaigns, related pilots, related reports, and history.

Lifecycle stages:

- lead
- qualified
- intro_scheduled
- proposal_sent
- pilot_scoped
- contract_pending
- active_pilot
- reporting
- renewal
- case_study
- expansion
- stalled
- lost

The partner lifecycle engine creates owned tasks for proposal follow-ups after 7 days, active-pilot reports after 14 days without a report, strong proof-value evidence notes, and case-study drafts when a partner reaches reporting. Stalled partners and proof-worthy partners are surfaced in the COO Brief and Overview.

The Partners page includes a detail drawer with timeline, next action, linked documents/artifacts, linked reports, open tasks, and a suggested follow-up draft. Follow-up drafts are draft-only and require human approval before any external email is sent.

Weekly Evidence Packs include partner movement, stalled partners, proof-worthy partner updates, campaign movement, funnel movement, revenue/pipeline notes, support learnings, autonomy actions, and SOC 2 Readiness notes so operating work turns into reviewed investor/acquirer evidence instead of living only in memory.

## Partner Program Engine

The Partner Program Engine lives under Growth:

- `#partner-programs`
- `#partner-pages`
- `#partner-dashboards`
- `#partner-reports`
- `#partner-proposals`

It operationalizes the LegalEase Record-Clearing Access Program (RCAP): a 90-day partner program for nonprofits, workforce programs, clinics, cities, counties, coalitions, and funders. Each program tracks package tier, payment status, contact, goal, audience, jurisdiction, landing page, dashboard URL, proposal status, report status, metrics, owner, next action, dashboard provisioning state, and history.

Supported tiers:

- Starter Program
- Implementation Program
- Strategic Program

Generators create draft-only artifacts from the uploaded LegalEase RCAP materials:

- Partner proposal draft
- Co-branded partner landing page draft
- Weekly partner report draft
- 90-day final impact report draft

Generated artifacts are saved under `data/exports/partner-programs/` in local mode and recorded in `partnerProgramArtifacts`. The generator also creates Data Room draft records and internal follow-up tasks. Nothing is emailed, published, or externally sent automatically.

Compliance boundary:

> LegalEase provides guided intake, information, workflow infrastructure, document preparation support where available, and partner reporting. LegalEase does not guarantee eligibility, court approval, filing acceptance, or legal outcomes.

Partner Dashboard bridge:

- Tracks the expected external dashboard repo `legalease-partner-dashboard-clean`.
- Checks required partner records: `demo-partner`, `we-must-vote`, and `fulton-county`.
- Records dashboard repo status, Supabase partner record status, admin write verification, production readiness verification, and last sync time.

Stripe readiness is diagnostic only. These environment variables must be configured before paid onboarding can be treated as ready:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_ACCESS_PROGRAM`
- `STRIPE_PRICE_IMPLEMENTATION_PROGRAM`
- `STRIPE_PRICE_STRATEGIC_PROGRAM`

No payment checkout is started by the Command Center in this pass. No payment means no active launch.
