import { getPool } from "./pool.ts";
import type {
  Category,
  Digest,
  DigestStatus,
  Source,
  SourceStatus,
} from "../types.ts";
import type {
  CategoryWithCount,
  DigestInsert,
  DigestItemDetail,
  DigestItemInput,
  FeedbackContext,
  InboxItem,
  InsertedItem,
  NewItem,
  PendingItem,
  SourceInput,
  Storage,
  WeekItem,
  WeekWindow,
} from "./types.ts";

// Postgres unique-violation SQLSTATE, surfaced on the error by node-postgres.
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

// Builds `($1,$2),($3,$4),...` placeholder tuples for a multi-row insert and
// returns them alongside the flattened parameter list.
function tuples<T>(rows: T[], toValues: (row: T) => unknown[]) {
  const params: unknown[] = [];
  const groups = rows.map((row) => {
    const values = toValues(row);
    const start = params.length;
    params.push(...values);
    return `(${values.map((_, i) => `$${start + i + 1}`).join(",")})`;
  });
  return { text: groups.join(","), params };
}

const JSONB_COLUMNS = new Set(["body", "token_usage"]);

export class PostgresStorage implements Storage {
  #pool = getPool();

  // sources

  async listActiveSources(): Promise<Source[]> {
    const { rows } = await this.#pool.query<Source>(
      `select * from sources where status = 'active'`,
    );
    return rows;
  }

  async listAllSources(): Promise<Source[]> {
    const { rows } = await this.#pool.query<Source>(
      `select * from sources order by title`,
    );
    return rows;
  }

  async listErrorSources(): Promise<Source[]> {
    const { rows } = await this.#pool.query<Source>(
      `select * from sources where status = 'error'`,
    );
    return rows;
  }

  async insertSource(input: SourceInput): Promise<void> {
    await this.#pool.query(
      `insert into sources (title, feed_url, site_url, category_id)
       values ($1, $2, $3, $4)`,
      [input.title, input.feed_url, input.site_url, input.category_id],
    );
  }

  async markSourceNotModified(id: string): Promise<void> {
    await this.#pool.query(
      `update sources
         set last_fetched_at = now(), consecutive_failures = 0, last_error = null
       where id = $1`,
      [id],
    );
  }

  async markSourceFetched(
    id: string,
    meta: { etag: string | null; last_modified: string | null },
  ): Promise<void> {
    await this.#pool.query(
      `update sources
         set etag = $2, last_modified = $3, last_fetched_at = now(),
             consecutive_failures = 0, last_error = null
       where id = $1`,
      [id, meta.etag, meta.last_modified],
    );
  }

  async markSourceFailure(
    id: string,
    fields: {
      last_error: string;
      consecutive_failures: number;
      status?: SourceStatus;
    },
  ): Promise<void> {
    if (fields.status) {
      await this.#pool.query(
        `update sources
           set last_error = $2, consecutive_failures = $3, status = $4
         where id = $1`,
        [id, fields.last_error, fields.consecutive_failures, fields.status],
      );
    } else {
      await this.#pool.query(
        `update sources
           set last_error = $2, consecutive_failures = $3
         where id = $1`,
        [id, fields.last_error, fields.consecutive_failures],
      );
    }
  }

  async setSourceStatus(
    id: string,
    status: SourceStatus,
    clearFailures: boolean,
  ): Promise<void> {
    if (clearFailures) {
      await this.#pool.query(
        `update sources
           set status = $2, consecutive_failures = 0, last_error = null
         where id = $1`,
        [id, status],
      );
    } else {
      await this.#pool.query(`update sources set status = $2 where id = $1`, [
        id,
        status,
      ]);
    }
  }

  async setSourceCategory(
    id: string,
    categoryId: string | null,
  ): Promise<void> {
    await this.#pool.query(
      `update sources set category_id = $2 where id = $1`,
      [id, categoryId],
    );
  }

  async deleteSource(id: string): Promise<void> {
    await this.#pool.query(`delete from sources where id = $1`, [id]);
  }

  // categories

  async listCategories(): Promise<Category[]> {
    const { rows } = await this.#pool.query<Category>(
      `select * from categories order by name`,
    );
    return rows;
  }

  async listCategoriesWithSourceCounts(): Promise<CategoryWithCount[]> {
    const { rows } = await this.#pool.query<CategoryWithCount>(
      `select c.*, count(s.id)::int as source_count
         from categories c
         left join sources s on s.category_id = c.id
        group by c.id
        order by c.name`,
    );
    return rows;
  }

  async findCategoryByName(name: string): Promise<Category | null> {
    const { rows } = await this.#pool.query<Category>(
      `select * from categories where lower(name) = lower($1)`,
      [name],
    );
    return rows[0] ?? null;
  }

  async insertCategory(name: string): Promise<Category> {
    const { rows } = await this.#pool.query<Category>(
      `insert into categories (name) values ($1) returning *`,
      [name],
    );
    return rows[0];
  }

  async updateCategory(id: string, name: string): Promise<Category | null> {
    const { rows } = await this.#pool.query<Category>(
      `update categories set name = $2, updated_at = now()
        where id = $1
        returning *`,
      [id, name],
    );
    return rows[0] ?? null;
  }

  async deleteCategory(
    id: string,
  ): Promise<{ deleted: boolean; unlinkedSourceTitles: string[] }> {
    // Both CTEs see the same snapshot, so `affected` reads the pre-delete
    // links even though the FK nulls category_id in the same statement.
    const { rows } = await this.#pool.query<{
      deleted_count: number;
      titles: string[];
    }>(
      `with affected as (
         select title from sources where category_id = $1
       ),
       deleted as (
         delete from categories where id = $1 returning id
       )
       select (select count(*) from deleted)::int as deleted_count,
              coalesce(
                (select array_agg(title order by title) from affected),
                '{}'
              ) as titles`,
      [id],
    );
    return {
      deleted: rows[0].deleted_count > 0,
      unlinkedSourceTitles: rows[0].titles,
    };
  }

  // items

  async upsertItems(rows: NewItem[]): Promise<InsertedItem[]> {
    if (rows.length === 0) return [];
    const { text, params } = tuples(rows, (r) => [
      r.source_id,
      r.guid,
      r.url,
      r.canonical_hash,
      r.title,
      r.author,
      r.content_text,
      r.published_at,
    ]);
    const { rows: inserted } = await this.#pool.query<InsertedItem>(
      `insert into items
         (source_id, guid, url, canonical_hash, title, author, content_text, published_at)
       values ${text}
       on conflict (source_id, canonical_hash) do nothing
       returning id, url, content_text`,
      params,
    );
    return inserted;
  }

  async updateItemContent(id: string, contentText: string): Promise<void> {
    await this.#pool.query(`update items set content_text = $2 where id = $1`, [
      id,
      contentText,
    ]);
  }

  async listUnsummarizedItems(limit: number): Promise<PendingItem[]> {
    const { rows } = await this.#pool.query<PendingItem>(
      `select id, title, content_text
         from items
        where summary is null
        order by fetched_at desc
        limit $1`,
      [limit],
    );
    return rows;
  }

  async updateItemSummary(
    id: string,
    summary: string,
    topics: string[],
  ): Promise<void> {
    await this.#pool.query(
      `update items set summary = $2, topics = $3 where id = $1`,
      [id, summary, topics],
    );
  }

  async countItemsSince(iso: string): Promise<number> {
    const { rows } = await this.#pool.query<{ n: number }>(
      `select count(*)::int as n from items where fetched_at >= $1`,
      [iso],
    );
    return rows[0]?.n ?? 0;
  }

  async listInboxItems(filter: {
    source?: string;
    category?: string;
    limit: number;
  }): Promise<InboxItem[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.source) {
      params.push(filter.source);
      where.push(`i.source_id = $${params.length}`);
    }
    if (filter.category) {
      params.push(filter.category);
      where.push(`s.category_id = $${params.length}`);
    }
    params.push(filter.limit);
    const limitParam = `$${params.length}`;
    const { rows } = await this.#pool.query<InboxItem>(
      `select i.id, i.title, i.url, i.summary, i.topics, i.published_at, i.fetched_at,
              json_build_object('id', s.id, 'title', s.title, 'category_id', s.category_id) as sources
         from items i
         join sources s on s.id = i.source_id
        ${where.length ? `where ${where.join(" and ")}` : ""}
        order by i.published_at desc nulls last
        limit ${limitParam}`,
      params,
    );
    return rows;
  }

  async getWeekItems(window: WeekWindow): Promise<WeekItem[]> {
    const { rows } = await this.#pool.query<WeekItem>(
      `select i.id, i.title, i.url, i.summary, i.topics, i.published_at, i.fetched_at, i.source_id,
              json_build_object('title', s.title, 'category_id', s.category_id) as sources
         from items i
         join sources s on s.id = i.source_id
        where (i.published_at >= $1 and i.published_at <= $2)
           or (i.published_at is null and i.fetched_at >= $1)`,
      [window.startUtc, window.endUtc],
    );
    return rows;
  }

  // digests

  async insertDigest(input: DigestInsert): Promise<{ id: string }> {
    const entries = Object.entries(input).filter(
      ([, value]) => value !== undefined,
    );
    const columns = entries.map(([key]) => key);
    const params = entries.map(([key, value]) =>
      JSONB_COLUMNS.has(key) ? JSON.stringify(value) : value,
    );
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const { rows } = await this.#pool.query<{ id: string }>(
      `insert into digests (${columns.join(", ")})
       values (${placeholders.join(", ")})
       returning id`,
      params,
    );
    return { id: rows[0].id };
  }

  async updateDigestStatus(id: string, status: DigestStatus): Promise<void> {
    await this.#pool.query(`update digests set status = $2 where id = $1`, [
      id,
      status,
    ]);
  }

  async listDigests(): Promise<Digest[]> {
    const { rows } = await this.#pool.query<Digest>(
      `select * from digests order by created_at desc`,
    );
    return rows;
  }

  async getLatestDigest(): Promise<Digest | null> {
    const { rows } = await this.#pool.query<Digest>(
      `select * from digests order by created_at desc limit 1`,
    );
    return rows[0] ?? null;
  }

  async getDigest(id: string): Promise<Digest | null> {
    const { rows } = await this.#pool.query<Digest>(
      `select * from digests where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  // digest_items

  async insertDigestItems(
    rows: DigestItemInput[],
  ): Promise<{ id: string; item_id: string }[]> {
    if (rows.length === 0) return [];
    const { text, params } = tuples(rows, (r) => [
      r.digest_id,
      r.item_id,
      r.verdict,
      r.reason,
      r.rank,
    ]);
    const { rows: inserted } = await this.#pool.query<{
      id: string;
      item_id: string;
    }>(
      `insert into digest_items (digest_id, item_id, verdict, reason, rank)
       values ${text}
       returning id, item_id`,
      params,
    );
    return inserted;
  }

  async getDigestItems(digestId: string): Promise<DigestItemDetail[]> {
    const { rows } = await this.#pool.query<DigestItemDetail>(
      `select di.id, di.digest_id, di.item_id, di.verdict, di.reason, di.rank,
              case when it.id is null then null else row_to_json(it) end as item,
              case when fb.id is null then null else row_to_json(fb) end as feedback
         from digest_items di
         left join items it on it.id = di.item_id
         left join feedback fb on fb.digest_item_id = di.id
        where di.digest_id = $1`,
      [digestId],
    );
    return rows;
  }

  // feedback

  async upsertFeedback(
    digestItemId: string,
    rating: string,
    comment: string | null,
  ): Promise<void> {
    await this.#pool.query(
      `insert into feedback (digest_item_id, rating, comment, updated_at)
       values ($1, $2, $3, now())
       on conflict (digest_item_id)
       do update set rating = excluded.rating, comment = excluded.comment, updated_at = now()`,
      [digestItemId, rating, comment],
    );
  }

  async listRecentFeedback(limit: number): Promise<FeedbackContext[]> {
    const { rows } = await this.#pool.query<FeedbackContext>(
      `select f.rating, f.comment, i.title as title, di.reason as reason
         from feedback f
         join digest_items di on di.id = f.digest_item_id
         left join items i on i.id = di.item_id
        order by f.created_at desc
        limit $1`,
      [limit],
    );
    return rows;
  }

  async listFeedbackSince(iso: string): Promise<FeedbackContext[]> {
    const { rows } = await this.#pool.query<FeedbackContext>(
      `select f.rating, f.comment, i.title as title, di.reason as reason
         from feedback f
         join digest_items di on di.id = f.digest_item_id
         left join items i on i.id = di.item_id
        where f.created_at > $1
        order by f.created_at asc`,
      [iso],
    );
    return rows;
  }

  // preference profile

  async getProfile(): Promise<{
    profile_md: string;
    updated_at: string;
  } | null> {
    const { rows } = await this.#pool.query<{
      profile_md: string;
      updated_at: string;
    }>(`select profile_md, updated_at from preference_profile where id = 1`);
    return rows[0] ?? null;
  }

  async updateProfileSynthesis(profileMd: string): Promise<void> {
    await this.#pool.query(
      `update preference_profile set profile_md = $1, updated_at = now() where id = 1`,
      [profileMd],
    );
  }

  async updateProfileManual(profileMd: string): Promise<void> {
    await this.#pool.query(
      `update preference_profile set profile_md = $1 where id = 1`,
      [profileMd],
    );
  }
}
