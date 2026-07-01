import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { z } from "zod";
import { callJson, createAnthropic, summaryModel } from "./anthropic.ts";
import type { Source } from "./types.ts";
import type { Storage } from "./storage/index.ts";
import type { NewItem } from "./storage/types.ts";

const USER_AGENT =
  "OwlyPost/0.1 (personal feed reader; +https://owly-post.com)";
const FEED_TIMEOUT_MS = 15_000;
const EXTRACT_TIMEOUT_MS = 8_000;
const EXTRACT_THRESHOLD_CHARS = 500;
const MAX_CONTENT_CHARS = 20_000;
const SUMMARY_CAP_PER_RUN = 100;
const SUMMARY_INPUT_CHARS = 4_000;
const FAILURES_BEFORE_ERROR = 5;

export type IngestStats = {
  sources: number;
  fetched: number;
  notModified: number;
  failed: number;
  newItems: number;
  summarized: number;
};

// Lowercase the host, strip utm_* parameters and the fragment, so the same
// article shared with different tracking params hashes identically.
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function canonicalHash(
  guid: string | null | undefined,
  url: string | null | undefined,
): string | null {
  const basis = guid?.trim() || (url ? normalizeUrl(url) : null);
  if (!basis) return null;
  return createHash("sha256").update(basis).digest("hex");
}

// Best-effort HTML to text: good enough for model input, not for display.
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

type FeedItem = Parser.Item & { contentEncoded?: string };

function itemContent(item: FeedItem): string {
  const html = item.contentEncoded || item.content || "";
  const text = stripHtml(html);
  return text.slice(0, MAX_CONTENT_CHARS);
}

function itemPublishedAt(item: FeedItem): string | null {
  const raw = item.isoDate ?? item.pubDate;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchFeed(source: Source): Promise<
  | { status: "not_modified" }
  | {
      status: "ok";
      items: FeedItem[];
      etag: string | null;
      lastModified: string | null;
    }
> {
  const headers: Record<string, string> = { "user-agent": USER_AGENT };
  if (source.etag) headers["if-none-match"] = source.etag;
  if (source.last_modified) headers["if-modified-since"] = source.last_modified;

  const response = await fetch(source.feed_url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });

  if (response.status === 304) {
    return { status: "not_modified" };
  }
  if (!response.ok) {
    throw new Error(`Feed responded with HTTP ${response.status}`);
  }

  const body = await response.text();
  const parser: Parser<unknown, FeedItem> = new Parser({
    customFields: { item: [["content:encoded", "contentEncoded"]] },
  });
  const feed = await parser.parseString(body);

  return {
    status: "ok",
    items: feed.items,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

// Best effort full-text extraction for items whose feed content is short.
async function extractFullText(url: string): Promise<string | null> {
  try {
    // Loaded lazily: @extractus/article-extractor is ESM-only and heavy, so it
    // is imported on demand only when an item actually needs full-text.
    const { extract } = await import("@extractus/article-extractor");
    const article = await extract(
      url,
      {},
      {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
      },
    );
    if (!article?.content) return null;
    const text = stripHtml(article.content);
    return text || null;
  } catch {
    return null;
  }
}

async function ingestSource(
  storage: Storage,
  source: Source,
): Promise<{ notModified: boolean; newItems: number }> {
  const result = await fetchFeed(source);

  if (result.status === "not_modified") {
    await storage.markSourceNotModified(source.id);
    return { notModified: true, newItems: 0 };
  }

  const seen = new Set<string>();
  const rows: NewItem[] = [];
  for (const item of result.items) {
    const hash = canonicalHash(item.guid, item.link);
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    rows.push({
      source_id: source.id,
      guid: item.guid ?? null,
      url: item.link ?? null,
      canonical_hash: hash,
      title: item.title?.trim() || "(untitled)",
      author: item.creator ?? null,
      content_text: itemContent(item),
      published_at: itemPublishedAt(item),
    });
  }

  const inserted = await storage.upsertItems(rows);

  // Full-text extraction for new items with thin feed content; failures keep
  // the feed excerpt.
  for (const item of inserted) {
    if (!item.url) continue;
    if ((item.content_text?.length ?? 0) >= EXTRACT_THRESHOLD_CHARS) continue;
    const fullText = await extractFullText(item.url);
    if (fullText && fullText.length > (item.content_text?.length ?? 0)) {
      await storage.updateItemContent(
        item.id,
        fullText.slice(0, MAX_CONTENT_CHARS),
      );
    }
  }

  await storage.markSourceFetched(source.id, {
    etag: result.etag,
    last_modified: result.lastModified,
  });

  return { notModified: false, newItems: inserted.length };
}

async function recordFailure(
  storage: Storage,
  source: Source,
  error: unknown,
): Promise<void> {
  const failures = source.consecutive_failures + 1;
  await storage.markSourceFailure(source.id, {
    last_error: error instanceof Error ? error.message : String(error),
    consecutive_failures: failures,
    ...(failures >= FAILURES_BEFORE_ERROR ? { status: "error" as const } : {}),
  });
}

const summarySchema = z.object({
  summary: z.string().min(1),
  topics: z.array(z.string()).max(3),
});

// Summarizes items that don't have a summary yet, capped per run; the rest
// are picked up on the next run.
export async function summarizePendingItems(
  storage: Storage,
): Promise<number> {
  const pending = await storage.listUnsummarizedItems(SUMMARY_CAP_PER_RUN);

  if (pending.length === 0) return 0;

  const client = createAnthropic();
  const model = summaryModel();
  const language = process.env.DIGEST_LANGUAGE || "nl";
  let summarized = 0;

  for (const item of pending) {
    try {
      const prompt = [
        `Summarize this article in exactly two sentences, written in the language "${language}", and list at most 3 short topic tags (in ${language === "en" ? "English" : `"${language}"`} or English, lowercase).`,
        "",
        `Title: ${item.title}`,
        `Content: ${(item.content_text ?? "").slice(0, SUMMARY_INPUT_CHARS)}`,
        "",
        `JSON shape: { "summary": string, "topics": string[] }`,
      ].join("\n");

      const { data } = await callJson({
        client,
        model,
        prompt,
        maxTokens: 300,
        schema: summarySchema,
      });

      await storage.updateItemSummary(item.id, data.summary, data.topics);
      summarized++;
    } catch (error) {
      // One bad item never kills the run; it is retried next run.
      console.error(`Summary failed for item ${item.id}:`, error);
    }
  }

  return summarized;
}

export async function runIngest(storage: Storage): Promise<IngestStats> {
  const sources = await storage.listActiveSources();

  const stats: IngestStats = {
    sources: sources.length,
    fetched: 0,
    notModified: 0,
    failed: 0,
    newItems: 0,
    summarized: 0,
  };

  for (const source of sources) {
    try {
      const result = await ingestSource(storage, source);
      if (result.notModified) {
        stats.notModified++;
      } else {
        stats.fetched++;
        stats.newItems += result.newItems;
      }
    } catch (error) {
      stats.failed++;
      console.error(`Ingest failed for ${source.feed_url}:`, error);
      await recordFailure(storage, source, error);
    }
  }

  stats.summarized = await summarizePendingItems(storage);
  return stats;
}
