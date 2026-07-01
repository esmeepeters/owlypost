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
export type WeekItem = {
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

// Half-open week window as ISO strings.
export type WeekWindow = { startUtc: string; endUtc: string };

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
  deleteSource(id: string): Promise<void>;

  // categories
  listCategories(): Promise<Category[]>;
  findCategoryByName(name: string): Promise<Category | null>;
  insertCategory(name: string): Promise<Category>;

  // items
  upsertItems(rows: NewItem[]): Promise<InsertedItem[]>;
  updateItemContent(id: string, contentText: string): Promise<void>;
  listUnsummarizedItems(limit: number): Promise<PendingItem[]>;
  updateItemSummary(
    id: string,
    summary: string,
    topics: string[],
  ): Promise<void>;
  countItemsSince(iso: string): Promise<number>;
  listInboxItems(filter: {
    source?: string;
    category?: string;
    limit: number;
  }): Promise<InboxItem[]>;
  getWeekItems(window: WeekWindow): Promise<WeekItem[]>;

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
