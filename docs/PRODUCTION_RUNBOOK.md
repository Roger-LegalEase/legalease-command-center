# LegalEase Command Center Production Runbook

Status: operational readiness guide. This does not enable live publishing or certify SOC 2 compliance.

## Non-Negotiable Safety Rails

- Never expose secrets.
- Never loosen fail-closed publishing.
- Never auto-publish without live gate, approval, and autonomy clearance.
- Never send emails without approval.
- Never generate legal advice.
- Never promise eligibility.
- Never promise court outcomes.
- Never delete production data without explicit confirmation.
- Never remove audit logs.
- Never weaken RLS or access control in production.
- Never commit API keys or tokens.

Stop and get explicit human approval before live posting, external emails, destructive database actions, deleting records, disabling safety gates, legal/compliance claims, pricing changes, secret exposure, paid external services, or production RLS/security changes.

## vNext release controls

All product flags are server-side and default to `false`:

```text
COMMAND_CENTER_UX_VNEXT=false
COMMAND_CENTER_UX_VNEXT_SOCIAL=false
COMMAND_CENTER_UX_VNEXT_OUTREACH=false
COMMAND_CENTER_UX_VNEXT_FILES=false
COMMAND_CENTER_UX_VNEXT_DISCOVERY=false
```

After the launch gate, authoritative GitHub CI, and human approval, enable the global shell for an internal cohort first, then Social, Outreach, Files, and Discovery one at a time. Observe health, compact-read latency, browser errors, authorization failures, and exact-link behavior between steps. These flags never authorize a send or publish. All `ENABLE_LIVE_*`, `OUTREACH_LIVE_SEND`, and `REACTIVATION_LIVE_SEND` controls remain false unless a separate reviewed production change authorizes them.

Before promotion, run `npm run verify:vnext-production` with synthetic configuration. Hosted production must still fail closed without durable storage, authentication, encryption, and private-storage health. CI and local verification require no production credential.

### vNext rollback

1. Set the affected product flag to `false`; if shell health is affected, set `COMMAND_CENTER_UX_VNEXT=false` first.
2. Confirm legacy aliases render and exact object links recover without a white screen.
3. Do not roll back persisted records or migrations merely to change presentation. If a database migration is implicated, use its documented forward-recovery or rollback procedure.
4. Re-run health, authentication, compact-read, and private-asset checks before reopening traffic.
5. Preserve audit events and record the commit, flag change, time, reason, and operator.

See `docs/ux-vnext/troubleshooting.md` for symptom-specific recovery.

## Deploy

1. Confirm local verification:

   ```bash
   npm run verify
   npm run verify:production
   ```

2. Create the Supabase core table by running:

   ```sql
   -- supabase/leos-core-records.sql
   create table if not exists public.leos_core_records (
     collection text not null,
     item_id text not null,
     payload jsonb not null default '{}'::jsonb,
     updated_at timestamptz not null default now(),
     primary key (collection, item_id)
   );

   create index if not exists leos_core_records_collection_idx
     on public.leos_core_records (collection);

   alter table public.leos_core_records enable row level security;
   ```

3. Keep no broad anon policies on `leos_core_records`. The Node server uses the service role key server-side only.

4. Set Render environment variables:

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

5. Deploy with:

   - Build command: `npm install`
   - Start command: `npm run start:production`
   - Health check path: `/api/health`

## Migrate Local Data

Run after the Supabase table exists:

```bash
npm run migrate:supabase
```

This upserts local JSON records into Supabase. It does not delete local data.

## Health Check

Use:

```bash
curl https://your-render-app.onrender.com/api/health
```

Expected:

- `appRunning: true`
- `storageBackend: "supabase"` in hosted mode
- `supabaseDbConnected: true`
- `supabaseStorageConnected: true`
- `openAIConfigured: true` if image/draft generation is enabled
- `liveGatesCount: 0` until explicit publishing approval

## Verify No Secrets Are Exposed

Check:

```bash
curl https://your-render-app.onrender.com/api/state
curl https://your-render-app.onrender.com/api/health
curl https://your-render-app.onrender.com/api/autonomy/status
```

No real API keys, service role keys, OAuth tokens, or encryption keys should appear.

## Disable Live Publishing

Set all gates to false:

```bash
ENABLE_LIVE_LINKEDIN_POSTING=false
ENABLE_LIVE_FACEBOOK_POSTING=false
ENABLE_LIVE_INSTAGRAM_POSTING=false
ENABLE_LIVE_X_POSTING=false
ENABLE_LIVE_TIKTOK_POSTING=false
ENABLE_LIVE_THREADS_POSTING=false
```

Restart the Render service and verify `/api/health` returns `liveGatesCount: 0`.

## Autonomy Checks

Use:

```bash
curl -X POST https://your-render-app.onrender.com/api/autonomy/check \
  -H 'content-type: application/json' \
  --data '{"actionType":"live_publish"}'
```

Live publishing should return `ok: false` and `approvalPolicy: "never_execute"` until the connector, live gate, approval, and explicit publishing policy are ready.

## Report Exports

Local mode writes under:

```txt
data/exports/reports/
```

Hosted Supabase mode uploads Weekly Evidence Pack Markdown/JSON to Supabase Storage under:

```txt
reports/
```

## Backup and Restore

Local backups remain a development/local safeguard. Hosted production should rely on Supabase backups plus export artifacts.

Before any restore:

1. Export the current data.
2. Create a backup/checkpoint.
3. Confirm the target environment.
4. Confirm the restore path.
5. Do not delete production data without explicit approval.

## Rollback

1. Disable live gates.
2. Revert Render to the previous deploy.
3. Confirm `/api/health`.
4. Confirm `/api/state` does not expose secrets.
5. Confirm `/api/autonomy/status`.
6. Review audit logs for actions taken during the incident window.

## Key Rotation

Rotate keys if any key appears in browser HTML, `/api/state`, `/api/health`, exported Markdown, logs, screenshots, or reports.

Order:

1. Revoke exposed key.
2. Create replacement key.
3. Update Render env var.
4. Restart service.
5. Run `npm run verify:production` locally against equivalent config when possible.
6. Confirm no exposed key remains.

## OAuth Debugging

1. Confirm redirect URL matches provider configuration.
2. Confirm `OAUTH_TOKEN_ENCRYPTION_KEY` is set.
3. Confirm tokens never appear in `/api/state`.
4. Test read-only Google flows before enabling any write scopes.

## Emergency Shutdown

1. Set every live publishing gate to false.
2. Rotate suspected exposed secrets.
3. Pause Render service if needed.
4. Export audit logs and recent activity.
5. Create an incident register entry.
6. Do not remove audit logs.
