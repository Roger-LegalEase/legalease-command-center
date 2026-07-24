begin;

create extension if not exists pgcrypto;

alter table public.leos_core_records
  add column if not exists version bigint not null default 1;

alter table public.leos_core_records
  drop constraint if exists leos_core_records_payload_object,
  add constraint leos_core_records_payload_object check (jsonb_typeof(payload) = 'object'),
  drop constraint if exists leos_core_records_key_bounds,
  add constraint leos_core_records_key_bounds check (
    length(collection) between 1 and 96 and
    length(item_id) between 1 and 256
  );

create or replace function public.leos_upsert_record_cas(
  p_collection text,
  p_item_id text,
  p_payload jsonb,
  p_expected_version bigint default null
) returns table(version bigint)
language plpgsql
security definer
set search_path = public
as $$
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
      raise exception using errcode = '40001', message = 'version conflict';
    end if;
    insert into public.leos_core_records(collection, item_id, payload, version, updated_at)
      values (p_collection, p_item_id, p_payload, 1, now());
    return query select 1::bigint;
    return;
  end if;
  if p_expected_version is null or p_expected_version <> current_version then
    raise exception using errcode = '40001', message = 'version conflict';
  end if;
  update public.leos_core_records r set payload = p_payload, version = r.version + 1, updated_at = now()
    where r.collection = p_collection and r.item_id = p_item_id;
  return query select current_version + 1;
end;
$$;

create or replace function public.leos_apply_core_mutations(p_mutations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      if found then raise exception using errcode = '40001', message = 'version conflict'; end if;
    elsif not found or current_version <> (mutation->>'expected_version')::bigint then
      raise exception using errcode = '40001', message = 'version conflict';
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
$$;

create table if not exists public.leos_social_publish_claims (
  claim_id text primary key,
  post_id text not null,
  channel text not null,
  approval_revision text not null,
  status text not null check (status in ('publish_claimed','publishing','published','failed_retryable','failed_terminal','reconciliation_required')),
  safe_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_id, channel, approval_revision)
);
alter table public.leos_social_publish_claims enable row level security;

create or replace function public.leos_claim_social_publish(p_post_id text, p_expected_version bigint, p_claim jsonb)
returns table(claimed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare post_row public.leos_core_records%rowtype; inserted_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('posts:' || p_post_id, 0));
  if exists (select 1 from public.leos_social_publish_claims where claim_id = p_claim->>'id') then
    return query select false;
    return;
  end if;
  select * into post_row from public.leos_core_records where collection = 'posts' and item_id = p_post_id for update;
  if not found or (p_expected_version is not null and post_row.version <> p_expected_version) then
    raise exception using errcode = '40001', message = 'version conflict';
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
$$;

create table if not exists public.leos_audit_events (
  event_id uuid primary key,
  occurred_at timestamptz not null,
  actor_id text not null,
  role text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  request_id text not null default '',
  outcome text not null,
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  source text not null,
  previous_hash text not null default '',
  event_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table public.leos_audit_events enable row level security;

create or replace function public.leos_reject_audit_mutation() returns trigger
language plpgsql as $$ begin raise exception 'audit events are append only'; end $$;
drop trigger if exists leos_audit_events_immutable on public.leos_audit_events;
create trigger leos_audit_events_immutable before update or delete on public.leos_audit_events
for each row execute function public.leos_reject_audit_mutation();

create or replace function public.leos_append_audit_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare previous text := ''; computed text; event_uuid uuid; stored jsonb;
begin
  if jsonb_typeof(p_event) <> 'object' or coalesce(p_event->>'id','') = '' then
    raise exception using errcode = '22023', message = 'invalid audit event';
  end if;
  event_uuid := (p_event->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('leos_audit_chain', 0));
  select event_hash into previous from public.leos_audit_events order by created_at desc, event_id desc limit 1;
  previous := coalesce(previous, '');
  computed := encode(digest(previous || p_event::text, 'sha256'), 'hex');
  stored := p_event || jsonb_build_object('previousHash', previous, 'eventHash', computed);
  insert into public.leos_audit_events(event_id, occurred_at, actor_id, role, action, target_type, target_id, request_id, outcome, summary, source, previous_hash, event_hash)
    values (event_uuid, (p_event->>'occurredAt')::timestamptz, p_event->>'actorId', p_event->>'role', p_event->>'action', p_event->>'targetType', p_event->>'targetId', coalesce(p_event->>'requestId',''), p_event->>'outcome', coalesce(p_event->'summary','{}'::jsonb), p_event->>'source', previous, computed)
    on conflict (event_id) do nothing;
  insert into public.leos_core_records(collection, item_id, payload, version, updated_at)
    values ('auditEvents', p_event->>'id', stored, 1, now()) on conflict do nothing;
  return stored;
end;
$$;

revoke all on function public.leos_upsert_record_cas(text,text,jsonb,bigint) from public, anon, authenticated;
revoke all on function public.leos_apply_core_mutations(jsonb) from public, anon, authenticated;
revoke all on function public.leos_claim_social_publish(text,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.leos_append_audit_event(jsonb) from public, anon, authenticated;
grant execute on function public.leos_upsert_record_cas(text,text,jsonb,bigint) to service_role;
grant execute on function public.leos_apply_core_mutations(jsonb) to service_role;
grant execute on function public.leos_claim_social_publish(text,bigint,jsonb) to service_role;
grant execute on function public.leos_append_audit_event(jsonb) to service_role;

commit;
