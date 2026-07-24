# Performance index + statement-timeout migration recovery

This migration is additive and low-risk: one index and one role-level setting. Take a Supabase backup before applying, as with every migration.

If the index build fails or must be removed: `drop index if exists public.leos_core_records_updated_at_idx;` — no data is touched and no application code depends on the index existing (it only makes the state-cache signature probe an index scan instead of a sequential scan). The index can be rebuilt at any time; on a large or busy table prefer `create index concurrently` from the SQL editor.

If the statement timeout causes legitimate statements to be cancelled (visible as 57014 `query_canceled` errors in the application's storage write-health telemetry): `alter role service_role reset statement_timeout;` restores the previous behavior immediately for new connections. The application's own 8-second request abort remains in place either way, so removing the ceiling never makes the app hang — it only removes the server-side reaping of statements the app already abandoned.

Neither change affects rows, schema shape, RPC functions, gates, or credentials. Application rollback is never required for this migration.
