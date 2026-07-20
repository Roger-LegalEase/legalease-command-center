# Secrets and environment contract

Hosted production is `NODE_ENV=production` or a truthy `RENDER` signal. Test mode explicitly overrides inherited hosting signals. The active server calls one production-readiness assertion before listening and never falls back to JSON.

Required hosted variables:

- `STORAGE_BACKEND=supabase`
- `SUPABASE_URL` (HTTPS) and `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL` (HTTPS)
- `COMMAND_CENTER_OWNER_TOKEN` as the bootstrap login credential
- `COMMAND_CENTER_SESSION_SECRET` for opaque-session and rate-limit hashing
- `COMMAND_CENTER_CRON_TOKEN` for the heartbeat-only principal
- `OAUTH_TOKEN_ENCRYPTION_KEY` and `OAUTH_STATE_SECRET`
- `ASSET_SIGNING_SECRET` and a private `SOCIAL_DRAFT_ASSETS_BUCKET`
- `SENDGRID_WEBHOOK_PUBLIC_KEY` when `SENDGRID_WEBHOOK_ENABLED` is true
- `PRODUCT_EVENT_WEBHOOK_SECRET` when `PRODUCT_EVENT_WEBHOOK_ENABLED` is true

Provider credentials are required only for the corresponding configured integration but must remain server-side. Current integrations can include SendGrid, Google Workspace, LinkedIn, X, Meta, Stripe, OpenAI, and Anthropic. Never expose credentials through `NEXT_PUBLIC_*`, HTML, diagnostics, logs, audit summaries, fixtures, or reports.

Supabase REST calls default to an 8,000 ms request timeout. `SUPABASE_REQUEST_TIMEOUT_MS` may override that bound and is clamped to 100–15,000 ms so storage failures return before the hosted request proxy deadline. Timed-out mutations are not retried because their durable outcome may be unknown.

Production rejects empty, placeholder, example, repeated, known-default, or weak critical secrets. Generate independent high-entropy values and rotate them separately. Bootstrap role credentials are accepted only by `POST /api/auth/login`; they are not bearer tokens or API cookies. The browser receives an expiring HttpOnly opaque session and a separate CSRF token.

Local JSON requires explicit `STORAGE_BACKEND=json` plus `LOCAL_DEMO_MODE=true` or `COMMAND_CENTER_ALLOW_JSON=true`. Tests set `NODE_ENV=test`, `COMMAND_CENTER_TEST_MODE=true`, and `SKIP_ENV_LOCAL_FILE=1`; they never load `.env.local` and mock providers. `.env.example` contains only reserved-domain examples and deliberately rejected placeholders.

Every outbound variable—including social posting, reactivation, outreach, alert email, and discovery—defaults false and remains a separate approval decision. See `docs/security/production-console-checklist.md` for manual rotation and console verification.
