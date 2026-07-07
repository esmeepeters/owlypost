-- Digest delivery schedule, editable in Settings. Replaces the DIGEST_CRON
-- env var as the source of truth; the worker polls this row and reschedules
-- without a restart. Times are evaluated in DIGEST_TIMEZONE.
create table if not exists digest_schedule (
  id int primary key default 1 check (id = 1),
  frequency text not null default 'weekly' check (frequency in ('daily', 'weekly')),
  -- Cron convention (0 = Sunday); ignored when frequency is 'daily'.
  day_of_week int not null default 0 check (day_of_week between 0 and 6),
  hour int not null default 17 check (hour between 0 and 23),
  minute int not null default 0 check (minute between 0 and 59),
  updated_at timestamptz not null default now()
);

-- Seed with the previous DIGEST_CRON default: weekly, Sunday, 17:00.
insert into digest_schedule (id) values (1) on conflict (id) do nothing;
