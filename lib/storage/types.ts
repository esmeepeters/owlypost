// The storage abstraction. The core talks to this interface instead of a
// concrete database SDK, so the implementation is swappable. The one shipped
// implementation is PostgresStorage (standard Postgres via a connection
// string); see ./postgres.ts.

import type {
  Category,
  Digest,
  DigestItem,
  DigestStatus,
  Feedback,
  Item,
  Rating,
  Source,
  SourceStatus,
  Verdict,
} from "../types.ts";

// An item joined with its source, as needed to build a digest.
export type DigestCandidate = {
  id: string;
  title: string;
  url: string | null;
  summary: string | null;
  topics: string[] | null;
  published_at: string | null;
  fetched_at: string;
  source_id: string;
  sources: { title: string; category_id: string | null };
};

// An item joined with its source, as shown in the inbox.
export type InboxItem = {
  id: string;
  title: string;
  url: string | null;
  summary: string | null;
  topics: string[] | null;
  published_at: string | null;
  fetched_at: string;
  sources: { id: string; title: string; category_id: string | null };
};

// A category with the number of sources currently assigned to it.
export type CategoryWithCount = Category & { source_count: number };

// Feedback flattened with the rated item's title and verdict reason, used as
// prompt context for the digest and profile synthesis. title is null when the
// underlying item was deleted.
export type FeedbackContext = {
  rating: Rating;
  comment: string | null;
  title: string | null;
  reason: string | null;
};

// A digest item joined with its item and (optional) feedback, for the digest
// detail page.
export type DigestItemDetail = DigestItem & {
  item: Item | null;
  feedback: Feedback | null;
};

export type NewItem = {
  source_id: string;
  guid: string | null;
  url: string | null;
  canonical_hash: string;
  url_hash: string | null;
  title: string;
  author: string | null;
  content_text: string | null;
  published_at: string | null;
};

export type InsertedItem = {
  id: string;
  url: string | null;
  content_text: string | null;
};

export type PendingItem = {
  id: string;
  title: string;
  content_text: string | null;
};

export type SourceInput = {
  title: string;
  feed_url: string;
  site_url: string | null;
  category_id: string | null;
};

export type DigestInsert = {
  week_start: string;
  week_end: string;
  status: DigestStatus;
  intro_md?: string | null;
  closing_md?: string | null;
  body?: unknown;
  model?: string | null;
  token_usage?: unknown;
  raw_response?: string | null;
};

export type DigestItemInput = {
  digest_id: string;
  item_id: string;
  verdict: Verdict;
  reason: string | null;
  rank: number | null;
};

// Closed time range as ISO strings.
export type ItemRange = { sinceUtc: string; untilUtc: string };

export interface Storage {
  // sources
  listActiveSources(): Promise<Source[]>;
  listAllSources(): Promise<Source[]>;
  listErrorSources(): Promise<Source[]>;
  insertSource(input: SourceInput): Promise<void>;
  markSourceNotModified(id: string): Promise<void>;
  markSourceFetched(
    id: string,
    meta: { etag: string | null; last_modified: string | null },
  ): Promise<void>;
  markSourceFailure(
    id: string,
    fields: {
      last_error: string;
      consecutive_failures: number;
      status?: SourceStatus;
    },
  ): Promise<void>;
  setSourceStatus(
    id: string,
    status: SourceStatus,
    clearFailures: boolean,
  ): Promise<void>;
  setSourceCategory(id: string, categoryId: string | null): Promise<void>;
  deleteSource(id: string): Promise<void>;

  // categories
  listCategories(): Promise<Category[]>;
  listCategoriesWithSourceCounts(): Promise<CategoryWithCount[]>;
  findCategoryByName(name: string): Promise<Category | null>;
  insertCategory(name: string): Promise<Category>;
  // Returns the updated row, or null when no category has this id.
  updateCategory(id: string, name: string): Promise<Category | null>;
  // Deletes the category; linked sources are unlinked (FK on delete set null),
  // never deleted. Returns deleted=false when the id does not exist, plus the
  // titles of sources that just became uncategorized.
  deleteCategory(
    id: string,
  ): Promise<{ deleted: boolean; unlinkedSourceTitles: string[] }>;

  // items
  upsertItems(rows: NewItem[]): Promise<InsertedItem[]>;
  updateItemContent(id: string, contentText: string): Promise<void>;
  listUnsummarizedItems(limit: number): Promise<PendingItem[]>;
  updateItemSummary(
    id: string,
    summary: string,
    topics: string[],
  ): Promise<void>;
  // Clears summaries so summarizePendingItems regenerates them; returns the
  // number of items affected.
  clearItemSummariesSince(iso: string): Promise<number>;
  countItemsSince(iso: string): Promise<number>;
  listInboxItems(filter: {
    source?: string;
    category?: string;
    limit: number;
  }): Promise<InboxItem[]>;
  // Items in the range (by published_at, falling back to fetched_at) that have
  // not been included in any digest yet.
  getUndigestedItems(range: ItemRange): Promise<DigestCandidate[]>;
  // Items with a URL but no url_hash yet (pre-0003 rows), for the one-off
  // backfill in scripts/backfill-url-hash.ts.
  listItemsMissingUrlHash(): Promise<
    { id: string; source_id: string; url: string; fetched_at: string }[]
  >;
  setItemUrlHash(id: string, urlHash: string): Promise<void>;

  // digests
  insertDigest(input: DigestInsert): Promise<{ id: string }>;
  updateDigestStatus(id: string, status: DigestStatus): Promise<void>;
  listDigests(): Promise<Digest[]>;
  getLatestDigest(): Promise<Digest | null>;
  getDigest(id: string): Promise<Digest | null>;

  // digest_items
  insertDigestItems(
    rows: DigestItemInput[],
  ): Promise<{ id: string; item_id: string }[]>;
  getDigestItems(digestId: string): Promise<DigestItemDetail[]>;

  // feedback
  upsertFeedback(
    digestItemId: string,
    rating: Rating,
    comment: string | null,
  ): Promise<void>;
  listRecentFeedback(limit: number): Promise<FeedbackContext[]>;
  listFeedbackSince(iso: string): Promise<FeedbackContext[]>;

  // preference profile
  getProfile(): Promise<{ profile_md: string; updated_at: string } | null>;
  updateProfileSynthesis(profileMd: string): Promise<void>;
  updateProfileManual(profileMd: string): Promise<void>;
}
