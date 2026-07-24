-- LegalEase Operating System hosted persistence core table.
-- Run this once in Supabase SQL editor before setting STORAGE_BACKEND=supabase.
create table if not exists public.leos_core_records (
  collection text not null,
  item_id text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, item_id)
);

create index if not exists leos_core_records_collection_idx
  on public.leos_core_records (collection);

alter table public.leos_core_records enable row level security;

-- No broad anon policies are created here. The Node app uses the service role key server-side only.
