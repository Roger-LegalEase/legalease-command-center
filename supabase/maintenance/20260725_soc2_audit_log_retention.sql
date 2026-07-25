-- 2026-07-25 soc2AuditLogs retention — PREPARED, NOT EXECUTED. Nothing in the app or CI
-- runs this file. Roger reviews it and runs it ONCE, manually, in the Supabase SQL editor
-- (or psql) against production, AFTER the perf-fix-02 app deploy is verified.
--
-- What it does, in one transaction:
--   1. Prints the current soc2AuditLogs row count and payload size.
--   2. Archives EVERY soc2AuditLogs row into a new timestamped table
--      (soc2_audit_logs_archive_20260725) and verifies the copy row-for-row.
--   3. Deletes soc2AuditLogs rows older than 90 days from leos_core_records.
--   4. Prints row count and payload size after the trim.
-- If the archive verification fails, the whole transaction aborts and NOTHING is deleted.
--
-- This file deliberately lives in supabase/maintenance/, not supabase/migrations/: it is a
-- one-off operator action on data, not a schema migration the app depends on.
--
-- Optional, before running: export a CSV copy to your machine (psql only):
--   \copy (select collection, item_id, payload, version, updated_at from leos_core_records where collection = 'soc2AuditLogs' order by updated_at) to 'soc2-audit-logs-20260725.csv' with (format csv, header true)
--   (Keep that CSV out of the repo — audit rows are operational security telemetry.)
--
-- Afterwards (outside the transaction, optional but recommended): reclaim the dead space —
-- deletes alone do not shrink the table on disk until vacuum runs.
--   vacuum (analyze) public.leos_core_records;

begin;

-- 1) Before: rows + payload bytes.
do $$
declare
  row_count bigint;
  payload_bytes bigint;
begin
  select count(*), coalesce(sum(pg_column_size(payload)), 0)
    into row_count, payload_bytes
    from public.leos_core_records
   where collection = 'soc2AuditLogs';
  raise notice 'BEFORE: soc2AuditLogs rows = %, payload bytes = % (~% MB)',
    row_count, payload_bytes, round(payload_bytes / 1048576.0, 1);
  raise notice 'BEFORE: leos_core_records total on-disk size = %',
    pg_size_pretty(pg_total_relation_size('public.leos_core_records'));
end $$;

-- 2) Archive the FULL collection. CREATE TABLE (not IF NOT EXISTS) on purpose: if this
--    script already ran, this line errors and the transaction aborts instead of silently
--    mixing two runs in one archive.
create table public.soc2_audit_logs_archive_20260725 as
  select collection, item_id, payload, version, updated_at
    from public.leos_core_records
   where collection = 'soc2AuditLogs';

-- Service-role only, like the live table: audit history must not become broadly readable.
revoke all on table public.soc2_audit_logs_archive_20260725 from public, anon, authenticated;

-- 3) Verify the archive row-for-row, then trim the live collection to the last 90 days.
do $$
declare
  live_count bigint;
  archive_count bigint;
  deleted_count bigint;
begin
  select count(*) into live_count from public.leos_core_records where collection = 'soc2AuditLogs';
  select count(*) into archive_count from public.soc2_audit_logs_archive_20260725;
  if archive_count <> live_count then
    raise exception 'ABORT: archive has % rows but live has % — nothing was deleted', archive_count, live_count;
  end if;
  raise notice 'ARCHIVE OK: % rows copied to soc2_audit_logs_archive_20260725', archive_count;

  delete from public.leos_core_records
   where collection = 'soc2AuditLogs'
     and updated_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  raise notice 'TRIM: deleted % soc2AuditLogs rows older than 90 days', deleted_count;
end $$;

-- 4) After: rows + payload bytes.
do $$
declare
  row_count bigint;
  payload_bytes bigint;
begin
  select count(*), coalesce(sum(pg_column_size(payload)), 0)
    into row_count, payload_bytes
    from public.leos_core_records
   where collection = 'soc2AuditLogs';
  raise notice 'AFTER: soc2AuditLogs rows = %, payload bytes = % (~% MB)',
    row_count, payload_bytes, round(payload_bytes / 1048576.0, 1);
  raise notice 'AFTER: on-disk size unchanged until vacuum; run: vacuum (analyze) public.leos_core_records;';
end $$;

commit;
