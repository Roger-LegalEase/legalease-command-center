-- Version conflicts must not be signalled as serialization failures.
--
-- 2026-07-28 incident. Supabase CPU pegged at 99% with RAM at 17%, connections at 55/160 and
-- essentially zero disk reads. The cause was not read volume: it was SQLSTATE 40001.
--
-- These three functions raised '40001' (serialization_failure) for an application-level
-- compare-and-set miss. PostgREST treats 40001 as a transient serialization failure and retries
-- the request itself, server-side, in a tight loop. Measured on production: ONE conflicting HTTP
-- request produced 157,901 'version conflict' raises in 126 seconds (~1,250/s) before Kong gave
-- up with a 504, and the retry loop kept running after the client disconnected. It stops only
-- when the backend is terminated or Postgres restarts.
--
-- The retry is not merely expensive, it is futile. p_expected_version is fixed in the request
-- body, so every retry re-reads the same row and fails identically. A conflict is a deterministic
-- answer ("your version is stale, re-read and try again"), never a transient one, so it must be
-- reported to the caller instead of being retried inside the database.
--
-- Fix: raise 'P0001' instead. PostgREST maps it to a plain HTTP 400 and returns it to the caller
-- immediately (verified on production against this same function's existing '22023' path, which
-- returns in 0.28s where '40001' took 126s). Nothing else about these functions changes: same
-- bodies, same locking, same CAS semantics, same 'version conflict' message the client matches on.
--
-- Deploy ORDER MATTERS: the application must be able to recognise 'P0001' as a conflict BEFORE
-- this migration is applied, or a conflict stops being retried by the client's own bounded
-- retry and surfaces as a hard write error. scripts/storage.mjs accepts BOTH codes, so ship the
-- app first, then apply this. Rollback is in supabase/recovery/20260728_001_version_conflict_non_retryable.md.

-- Transactional, as scripts/validate-migrations.mjs requires: CREATE OR REPLACE FUNCTION is
-- transactional in Postgres, so all three definitions swap together or none of them do. There is
-- no half-applied state in which some CAS paths raise P0001 while others still raise 40001.
begin;

create or replace function public.leos_upsert_record_cas(p_collection text, p_item_id text, p_payload jsonb, p_expected_version bigint default null)
returns table(version bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare current_version bigint;
begin
  if p_collection is null or p_item_id is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid core record';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_collection || ':' || p_item_id, 0));
  select r.version into current_version from public.leos_core_records r
    where r.collection = p_collection and r.item_id = p_item_id for update;
  if not found then
    if p_expected_version is not null and p_expected_version <> 0 then
      raise exception using errcode = 'P0001', message = 'version conflict';
    end if;
    insert into public.leos_core_records(collection, item_id, payload, version, updated_at)
      values (p_collection, p_item_id, p_payload, 1, now());
    return query select 1::bigint;
    return;
  end if;
  if p_expected_version is null or p_expected_version <> current_version then
    raise exception using errcode = 'P0001', message = 'version conflict';
  end if;
  update public.leos_core_records r set payload = p_payload, version = r.version + 1, updated_at = now()
    where r.collection = p_collection and r.item_id = p_item_id;
  return query select current_version + 1;
end;
$function$;

create or replace function public.leos_apply_core_mutations(p_mutations jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare mutation jsonb; current_version bigint; affected integer := 0;
begin
  if jsonb_typeof(p_mutations) <> 'array' or jsonb_array_length(p_mutations) > 20000 then
    raise exception using errcode = '22023', message = 'invalid mutation batch';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_mutations) m
    group by m->>'collection', m->>'item_id' having count(*) > 1
  ) then raise exception using errcode = '22023', message = 'duplicate mutation key'; end if;

  for mutation in select value from jsonb_array_elements(p_mutations) order by value->>'collection', value->>'item_id' loop
    if mutation->>'operation' not in ('upsert', 'delete')
      or coalesce(mutation->>'collection', '') = '' or coalesce(mutation->>'item_id', '') = '' then
      raise exception using errcode = '22023', message = 'invalid mutation';
    end if;
    perform pg_advisory_xact_lock(hashtextextended((mutation->>'collection') || ':' || (mutation->>'item_id'), 0));
  end loop;

  for mutation in select value from jsonb_array_elements(p_mutations) loop
    select r.version into current_version from public.leos_core_records r
      where r.collection = mutation->>'collection' and r.item_id = mutation->>'item_id' for update;
    if (mutation->>'expected_version') is null then
      if found then raise exception using errcode = 'P0001', message = 'version conflict'; end if;
    elsif not found or current_version <> (mutation->>'expected_version')::bigint then
      raise exception using errcode = 'P0001', message = 'version conflict';
    end if;
    if mutation->>'operation' = 'upsert' and jsonb_typeof(mutation->'payload') <> 'object' then
      raise exception using errcode = '22023', message = 'invalid mutation payload';
    end if;
  end loop;

  for mutation in select value from jsonb_array_elements(p_mutations) loop
    if mutation->>'operation' = 'delete' then
      delete from public.leos_core_records where collection = mutation->>'collection' and item_id = mutation->>'item_id';
    elsif (mutation->>'expected_version') is null then
      insert into public.leos_core_records(collection, item_id, payload, version, updated_at)
        values (mutation->>'collection', mutation->>'item_id', mutation->'payload', 1, now());
    else
      update public.leos_core_records set payload = mutation->'payload', version = version + 1, updated_at = now()
        where collection = mutation->>'collection' and item_id = mutation->>'item_id';
    end if;
    affected := affected + 1;
  end loop;
  return jsonb_build_object('applied', affected);
end;
$function$;

create or replace function public.leos_claim_social_publish(p_post_id text, p_expected_version bigint, p_claim jsonb)
returns table(claimed boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare post_row public.leos_core_records%rowtype; inserted_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('posts:' || p_post_id, 0));
  if exists (select 1 from public.leos_social_publish_claims where claim_id = p_claim->>'id') then
    return query select false;
    return;
  end if;
  select * into post_row from public.leos_core_records where collection = 'posts' and item_id = p_post_id for update;
  if not found or (p_expected_version is not null and post_row.version <> p_expected_version) then
    raise exception using errcode = 'P0001', message = 'version conflict';
  end if;
  if coalesce(post_row.payload->>'status', '') not in ('approved','scheduled','retry_ready') then
    raise exception using errcode = '22023', message = 'post is not approved';
  end if;
  insert into public.leos_social_publish_claims(claim_id, post_id, channel, approval_revision, status, safe_payload)
    values (p_claim->>'id', p_post_id, p_claim->>'channel', p_claim->>'approvalRevision', 'publish_claimed', p_claim)
    on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return query select false; return; end if;
  insert into public.leos_core_records(collection, item_id, payload, version, updated_at)
    values ('publishClaims', p_claim->>'id', p_claim, 1, now()) on conflict do nothing;
  update public.leos_core_records set
    payload = jsonb_set(jsonb_set(payload, '{status}', '"publish_claimed"'::jsonb), '{publishingStatus}', '"publish_claimed"'::jsonb),
    version = version + 1,
    updated_at = now()
    where collection = 'posts' and item_id = p_post_id;
  return query select true;
end;
$function$;

commit;
