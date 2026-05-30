# Backup And Restore

Selected approach:

- Production durable data should live in Postgres through `DATABASE_URL`.
- Neon, Supabase Postgres, or Render Postgres can provide the database.
- `DATABASE_URL` is a server-only secret and must be configured in Render environment variables.

What is backed up:

- captures and inbox items
- tasks
- priorities and focus
- notes, decisions, blockers
- Morning Brief, closeout, and tomorrow plan data
- Social ideas, drafts, planned posts, ready posts, manually published records, and manually entered URLs
- Proof, wins, customer notes, evidence, and proof-to-social links
- activity log and non-secret settings

What is not backed up:

- API keys
- provider tokens
- refresh tokens
- `DATABASE_URL`
- temporary generated exports
- local cache files

Export:

1. Use the database provider's backup/export tool.
2. Keep app-level exports from `data/exports` as convenience artifacts only.
3. Verify Social and Proof records are included.

Restore:

1. Restore into a new Postgres database or provider snapshot.
2. Set Render `DATABASE_URL` to the restored database.
3. Restart the service.
4. Open `/api/health` and confirm `databaseConfigured` and `databaseReachable`.
5. Open Social and Proof to verify records.

Local migration:

- Use `node scripts/migrate-local-data-to-postgres.mjs --dry-run` first.
- Run without `--dry-run` only after setting `DATABASE_URL`.
- The script creates a local backup before importing and does not delete original files.

Credential rotation:

- Rotate `DATABASE_URL` credentials in the database provider.
- Update Render environment variables.
- Restart the app.
- Rotate any exposed provider keys immediately.

Manual setup still needed:

- Create the Postgres database in Neon, Supabase, or Render.
- Add `DATABASE_URL` in Render.
- Configure provider backups.
- Run migration if local JSON contains data that should be retained.
