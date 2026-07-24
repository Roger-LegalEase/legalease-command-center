-- 2026-07-24 performance hardening — PROPOSED, additive only. Nothing in the app
-- executes this file; Roger runs it once in the Supabase SQL editor after review.
-- Context: pg_stat_statements showed set_config('search_path',...) at 683,878,980
-- calls / 59.9% of DB time (a Supabase Data API request storm; app-side fix in the
-- same PR), with DB CPU at 91%. The two items below are the database-side guardrails.

begin;

-- 1) Index for the state-cache signature probe.
--
-- Query it serves (storage.mjs _remoteStateSignature — runs on essentially every
-- state read once the 3s burst window has passed):
--
--   select updated_at from leos_core_records
--   where collection <> 'authSessions'
--   order by updated_at desc limit 1;
--
-- Plan evidence (local Postgres 15, synthetic 60,000-row leos_core_records with the
-- production schema — production has no pg access from this repo, so plans were
-- captured locally and labeled as such):
--
--   WITHOUT the index:
--     Limit -> Sort (top-N heapsort) -> Seq Scan on leos_core_records
--       (actual time=30.246..30.247)  Execution Time: 30.312 ms
--     A full sequential scan + sort of the whole table, once per probe, forever.
--
--   WITH the index:
--     Limit -> Index Scan using leos_core_records_updated_at_idx
--       (actual time=0.054..0.055)   Execution Time: 0.132 ms   (~230x)
--
-- The dominant paged read shape (order by collection, item_id ... limit/offset) and
-- the targeted collection=in.(...) reads were ALSO explained and both already use
-- the primary key index (no sequential scan) — no additional index is proposed for
-- them; their production tail latency (mean 63ms / max 4.8s) is CPU starvation from
-- the request storm, not a missing index. The INSERT shape (mean 348ms / max 7.7s)
-- was the ever-growing audit-array rpc write, fixed at the application source in
-- this PR — an index cannot and need not address it.
create index if not exists leos_core_records_updated_at_idx
  on public.leos_core_records (updated_at desc);

-- 2) Statement timeout for the app's database sessions (~10s).
--
-- The app's own HTTP timeout aborts Supabase REST requests at 8s, but the CANCELLED
-- statement can keep burning CPU server-side without a database-level ceiling.
-- PostgREST executes as the role the request authenticates to — this app uses the
-- service role key exclusively (server-side only), so the ceiling goes on
-- service_role. 10s > the app's 8s abort, so the database never kills a statement
-- the app is still waiting on; it only reaps runaways the app already gave up on.
alter role service_role set statement_timeout = '10s';

commit;

-- Rollback (manual, if ever needed):
--   drop index if exists public.leos_core_records_updated_at_idx;
--   alter role service_role reset statement_timeout;
