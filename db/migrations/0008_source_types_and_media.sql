-- Source types (rss / youtube / podcast / reddit) and item media metadata,
-- so videos and podcast episodes can be played in the inbox.

alter table sources add column if not exists type text not null default 'rss';

do $$
begin
  alter table sources add constraint sources_type_check
    check (type in ('rss', 'youtube', 'podcast', 'reddit'));
exception
  when duplicate_object then null;
end $$;

-- Backfill the types identifiable from feed_url alone; podcasts are
-- reclassified at the next ingest (recognizing them needs the feed body).
update sources set type = 'youtube'
 where type = 'rss'
   and feed_url like 'https://www.youtube.com/feeds/videos.xml%';
update sources set type = 'reddit'
 where type = 'rss'
   and feed_url ~ '^https?://(www\.|old\.)?reddit\.com/.+\.rss$';

alter table items add column if not exists media_url text;
alter table items add column if not exists media_type text;
alter table items add column if not exists duration_seconds int;
alter table items add column if not exists thumbnail_url text;
alter table items add column if not exists external_id text;
