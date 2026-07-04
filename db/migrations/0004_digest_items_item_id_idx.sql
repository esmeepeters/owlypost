-- Supports the digest's "not yet included in any digest" anti-join; item_id
-- was previously only covered as the second column of the unique constraint,
-- which does not help an item-first probe.

create index if not exists digest_items_item_id_idx on digest_items (item_id);
