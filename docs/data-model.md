# Data Model

Durable production data belongs in Postgres through `DATABASE_URL`.

Core entities:

- `captures`: inbox items and quick captures.
- `tasks`: open, waiting, blocked, done, and archived work.
- `priorities`: Today's Top 3.
- `today_focus`: the one thing that matters today.
- `notes`: notes and decisions.
- `decisions`: choices Roger needs to make or has made.
- `blockers`: anything stopping progress.
- `daily_closeouts`: end-of-day closeout records.
- `tomorrow_plans`: next-day plan summaries.
- `morning_briefs`: morning summaries.
- `what_moved`: short activity summaries.
- `activity_log`: internal activity and audit records.
- `app_settings`: non-secret settings only.

Social entities:

- `social_records`: ideas, drafts, ready-to-publish posts, manually published records.
- Required fields: id, type, body, status, created_at, updated_at.
- Optional fields: channel, title, source, planned_date, manually_published_at, published_url.
- Social live posting is not active.

Proof entities:

- `proof_items`: proof, evidence, and data-room style items.
- `wins`: business wins.
- `customer_notes`: customer or partner notes that support proof.
- `evidence_items`: evidence notes.
- `proof_to_social_links`: links between proof and social ideas/drafts.

Do not store:

- API keys
- provider tokens
- refresh tokens
- service-role keys
- `DATABASE_URL`
- unnecessary raw provider responses

Migration notes:

- Local JSON can be imported with `scripts/migrate-local-data-to-postgres.mjs`.
- The migration is idempotent and dry-run friendly.
