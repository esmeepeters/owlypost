-- Cross-feed dedup: url_hash is sha256(normalizeUrl(url)), computed in TS at
-- insert time; null when the item has no URL and for pre-migration rows
-- (assigned later by scripts/backfill-url-hash.ts). The exclusion constraint
-- forbids the same url_hash under two DIFFERENT sources while leaving
-- within-source dedup to the existing unique (source_id, canonical_hash) —
-- some feeds link every item to the same page and differ only by guid, so a
-- global unique index on url_hash would wrongly collapse them.
--
-- Nulls never conflict in an exclusion constraint, so adding it to a database
-- that already contains cross-feed duplicates always succeeds.

create extension if not exists btree_gist;

alter table items add column if not exists url_hash text;

-- ADD CONSTRAINT ... EXCLUDE has no IF NOT EXISTS; swallow the rerun error.
do $$
begin
  alter table items add constraint items_url_hash_cross_source_excl
    exclude using gist (url_hash with =, source_id with <>);
exception
  when duplicate_object then null;
end $$;
