# Version-conflict SQLSTATE migration recovery

This migration changes three lines of behaviour and nothing else: `leos_upsert_record_cas`,
`leos_apply_core_mutations` and `leos_claim_social_publish` raise `P0001` instead of `40001` for a
version conflict. Function bodies, locking, CAS semantics, the `'version conflict'` message, rows,
schema shape, grants and gates are all unchanged. No data is touched, so no data rollback exists or
is needed.

## Why

`40001` is `serialization_failure`. PostgREST treats it as transient and retries the request
server-side in an unbounded loop. Because `p_expected_version` is fixed in the request body, every
retry re-reads the same row and fails identically — the retry can never succeed. Measured on
production 2026-07-28: one conflicting HTTP request produced 157,901 raises in 126 seconds
(~1,250/s), returned 504 to the caller, and **kept retrying after the client disconnected**. It
stopped only when the backend was terminated. That single loop is enough to hold the database at
99% CPU with near-zero disk I/O.

## Deploy order

The application must ship first. `scripts/storage.mjs` accepts **both** `P0001` and `40001` as a
conflict, so:

1. Deploy the app (accepts both codes).
2. Apply this migration.

Applying the migration against an app that only knows `40001` would turn conflicts into generic
write errors, bypassing the client's own bounded CAS retry in `mutateCollectionItem`.

## Rollback

Re-apply `supabase/migrations/20260713_001_production_hardening.sql`, which contains the previous
definitions of all three functions verbatim. Because the app accepts both codes, rolling back does
not require an application rollback and does not break conflict detection — it only reinstates the
retry storm, so roll back only if these functions are broken for some unrelated reason.

## Verifying the fix on production

A conflicting call must now return quickly with a `P0001` body instead of hanging:

```
curl -s -X POST -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"p_mutations":[{"operation":"upsert","collection":"priorities","item_id":"__probe__","expected_version":999,"payload":{}}]}' \
  "$SUPABASE_URL/rest/v1/rpc/leos_apply_core_mutations" -w "\n%{http_code} in %{time_total}s\n"
```

Expect HTTP 400, `{"code":"P0001", ... "version conflict"}`, in well under a second. Before the
migration this request hangs for ~126s and returns 504. The probe targets a non-existent item id
and changes no rows either way.

## If a retry storm is ever seen again

Symptom: `pg_stat_database.xact_rollback` climbing by ~1,500/s with `xact_commit` near zero,
`blks_hit` high and `blks_read` ~0, and `pg_stat_statements` showing almost nothing (errored
statements are not recorded there — that is why this was invisible for a day). Confirm in
`postgres_logs` by `error_severity='ERROR'`.

Immediate mitigation, no deploy required — terminate the looping backend:

```sql
select pid, pg_terminate_backend(pid) from pg_stat_activity
where backend_type='client backend' and application_name='postgrest'
  and now()-backend_start > interval '60 seconds' and state='active';
```

PostgREST reconnects on its own. Re-run it if the state filter races with the retry loop, which
flips between `active` and `idle` many times a second.
