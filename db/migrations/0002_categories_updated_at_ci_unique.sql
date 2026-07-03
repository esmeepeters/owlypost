-- Adds updated_at to categories and enforces case-insensitive unique names.
--
-- If an existing database has case-duplicate names (e.g. "AI" and "ai"), the
-- guard below fails the migration with a descriptive error. Merge or rename
-- the duplicates manually, then re-run migrations.

alter table categories
  add column if not exists updated_at timestamptz not null default now();

do $$
declare dupes text;
begin
  select string_agg(names, '; ') into dupes
  from (
    select array_to_string(array_agg(name order by name), ' / ') as names
      from categories
     group by lower(name)
    having count(*) > 1
  ) d;
  if dupes is not null then
    raise exception 'categories has case-insensitive duplicate names (%). Merge or rename them, then re-run migrations.', dupes;
  end if;
end $$;

create unique index if not exists categories_name_lower_idx
  on categories (lower(name));
