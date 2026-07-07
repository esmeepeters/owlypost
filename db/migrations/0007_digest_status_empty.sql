-- Allow the 'empty' digest status: a period in which no new items arrived.
alter table digests drop constraint if exists digests_status_check;
alter table digests add constraint digests_status_check
  check (status in ('draft', 'ready', 'sent', 'failed', 'empty'));
