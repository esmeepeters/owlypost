-- Initial schema for Owly Post (self-hosted, standard Postgres).
--
-- Single-user instance: there is no auth and no row-level security. Access
-- control is the operator's responsibility at the deployment level (reverse
-- proxy, VPN, network isolation). Statements are idempotent so this migration
-- is safe to apply against an already-populated database (e.g. an existing
-- Supabase project reached via its Postgres connection string).

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  title text not null,
  site_url text,
  feed_url text not null unique,
  status text not null default 'active' check (status in ('active','paused','error')),
  etag text,
  last_modified text,
  last_fetched_at timestamptz,
  consecutive_failures int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  guid text,
  url text,
  canonical_hash text not null,
  title text not null,
  author text,
  content_text text,
  summary text,
  topics text[],
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (source_id, canonical_hash)
);
create index if not exists items_published_at_idx on items (published_at desc);
create index if not exists items_source_id_idx on items (source_id);

create table if not exists digests (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  status text not null default 'draft' check (status in ('draft','ready','sent','failed')),
  intro_md text,
  closing_md text,
  body jsonb,
  model text,
  token_usage jsonb,
  raw_response text,
  created_at timestamptz not null default now()
);

create table if not exists digest_items (
  id uuid primary key default gen_random_uuid(),
  digest_id uuid not null references digests(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  verdict text not null check (verdict in ('must_read','worth_it','skip')),
  reason text,
  rank int,
  unique (digest_id, item_id)
);
create index if not exists digest_items_digest_id_idx on digest_items (digest_id);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  digest_item_id uuid not null references digest_items(id) on delete cascade,
  rating text not null check (rating in ('up','down')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (digest_item_id)
);

create table if not exists preference_profile (
  id int primary key default 1 check (id = 1),
  profile_md text not null default '',
  updated_at timestamptz not null default now()
);
insert into preference_profile (id) values (1) on conflict (id) do nothing;
