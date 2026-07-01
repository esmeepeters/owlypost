// Row types for the tables in db/migrations, kept by hand since the schema is
// small and there is no generated-types pipeline.

export type SourceStatus = "active" | "paused" | "error";
export type DigestStatus = "draft" | "ready" | "sent" | "failed";
export type Verdict = "must_read" | "worth_it" | "skip";
export type Rating = "up" | "down";

export type Category = {
  id: string;
  name: string;
  created_at: string;
};

export type Source = {
  id: string;
  category_id: string | null;
  title: string;
  site_url: string | null;
  feed_url: string;
  status: SourceStatus;
  etag: string | null;
  last_modified: string | null;
  last_fetched_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  created_at: string;
};

export type Item = {
  id: string;
  source_id: string;
  guid: string | null;
  url: string | null;
  canonical_hash: string;
  title: string;
  author: string | null;
  content_text: string | null;
  summary: string | null;
  topics: string[] | null;
  published_at: string | null;
  fetched_at: string;
};

export type Digest = {
  id: string;
  week_start: string;
  week_end: string;
  status: DigestStatus;
  intro_md: string | null;
  closing_md: string | null;
  body: unknown;
  model: string | null;
  token_usage: unknown;
  raw_response: string | null;
  created_at: string;
};

export type DigestItem = {
  id: string;
  digest_id: string;
  item_id: string;
  verdict: Verdict;
  reason: string | null;
  rank: number | null;
};

export type Feedback = {
  id: string;
  digest_item_id: string;
  rating: Rating;
  comment: string | null;
  created_at: string;
  updated_at: string;
};
