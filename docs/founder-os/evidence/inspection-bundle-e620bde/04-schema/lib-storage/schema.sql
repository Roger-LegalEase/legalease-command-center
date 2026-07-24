create table if not exists os_records (
  id text not null,
  entity_type text not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entity_type, id)
);

create table if not exists social_records (
  id text primary key,
  type text not null check (type in ('idea', 'draft', 'ready', 'manually_published')),
  channel text,
  title text,
  body text not null,
  source text,
  planned_date timestamptz,
  status text not null,
  manually_published_at timestamptz,
  published_url text,
  record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists os_records_entity_updated_idx on os_records (entity_type, updated_at desc);
create index if not exists social_records_type_status_idx on social_records (type, status);
