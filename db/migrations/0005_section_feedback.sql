-- Feedback on a digest section's narrative summary. Sections are not rows —
-- they live inside digests.body jsonb — so feedback is keyed by
-- (digest_id, category name).
create table if not exists section_feedback (
  id uuid primary key default gen_random_uuid(),
  digest_id uuid not null references digests(id) on delete cascade,
  category text not null,
  rating text not null check (rating in ('up', 'down')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (digest_id, category)
);
