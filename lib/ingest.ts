import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { z } from "zod";
import { getLlm } from "./llm/index.ts";
import { USER_AGENT, assertPublicUrl, safeFetch, safeHttpUrl } from "./net.ts";
import { classifyFeed } from "./feed-detect.ts";
import type { Source, SourceType } from "./types.ts";
import type { Storage } from "./storage/index.ts";
import type { NewItem } from "./storage/types.ts";

const FEED_TIMEOUT_MS = 15_000;
const EXTRACT_TIMEOUT_MS = 8_000;
const EXTRACT_THRESHOLD_CHARS = 500;
const MAX_CONTENT_CHARS = 20_000;
const SUMMARY_CAP_PER_RUN = 100;
const SUMMARY_INPUT_CHARS = 8_000;
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

// Unlike canonicalHash this ignores the guid, so the same article carried by
// two different feeds (feed-specific guids, same link) hashes identically —
// the key for cross-feed dedup.
export function urlHash(url: string | null | undefined): string | null {
  if (!url) return null;
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}

export type BackfillRow = {
  id: string;
  source_id: string;
  url: string;
  fetched_at: string;
};

// Plans url_hash assignments for items ingested before the cross-feed dedup
// migration (0003). In a URL group spanning multiple sources only the
// earliest-fetched item gets the hash — the rest stay null so the cross-source
// exclusion constraint is never violated.
export function planUrlHashBackfill(
  rows: BackfillRow[],
): { id: string; url_hash: string }[] {
  const groups = new Map<string, BackfillRow[]>();
  for (const row of rows) {
    const hash = urlHash(row.url);
    if (!hash) continue;
    const group = groups.get(hash) ?? [];
    group.push(row);
    groups.set(hash, group);
  }

  const plan: { id: string; url_hash: string }[] = [];
  for (const [hash, group] of groups) {
    const sourceIds = new Set(group.map((row) => row.source_id));
    if (sourceIds.size === 1) {
      for (const row of group) plan.push({ id: row.id, url_hash: hash });
    } else {
      const earliest = group.reduce((a, b) =>
        a.fetched_at <= b.fetched_at ? a : b,
      );
      plan.push({ id: earliest.id, url_hash: hash });
    }
  }
  return plan;
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

// The media:* and yt:* shapes come from xml2js via rss-parser customFields:
// child elements land as arrays, attributes under `$`. The item-level itunes
// object is decorated by rss-parser itself.
export type FeedItem = Parser.Item & {
  contentEncoded?: string;
  mediaGroup?: {
    "media:description"?: unknown[];
    "media:thumbnail"?: { $?: { url?: string } }[];
  };
  ytVideoId?: string;
  itunes?: { duration?: string; image?: string; summary?: string };
};

function itemContent(item: FeedItem): string {
  const html = item.contentEncoded || item.content || "";
  const text = stripHtml(html);
  return text.slice(0, MAX_CONTENT_CHARS);
}

// Parses an itunes:duration value: plain seconds ("3723") or colon notation
// ("1:02:03", "12:34").
export function parseItunesDuration(raw: string | undefined): number | null {
  if (!raw) return null;
  const parts = raw.trim().split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }
  return parts.map(Number).reduce((total, part) => total * 60 + part, 0);
}

type MediaFields = Pick<
  NewItem,
  | "media_url"
  | "media_type"
  | "duration_seconds"
  | "thumbnail_url"
  | "external_id"
> & { content_text: string };

// Per-type mapping of a feed item to content and media columns. YouTube's
// media:description is plain text; podcast show notes are HTML.
export function mediaFields(
  type: SourceType,
  item: FeedItem,
  feedImage: string | null,
): MediaFields {
  if (type === "youtube") {
    const videoId = item.ytVideoId ?? null;
    const rawDescription = item.mediaGroup?.["media:description"]?.[0];
    const description =
      typeof rawDescription === "string" ? rawDescription.trim() : "";
    return {
      media_url: null,
      media_type: null,
      duration_seconds: null,
      thumbnail_url:
        safeHttpUrl(item.mediaGroup?.["media:thumbnail"]?.[0]?.$?.url) ??
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null),
      external_id: videoId,
      content_text: description.slice(0, MAX_CONTENT_CHARS),
    };
  }
  if (type === "podcast") {
    const html =
      item.contentEncoded || item.content || item.itunes?.summary || "";
    return {
      media_url: safeHttpUrl(item.enclosure?.url),
      media_type: item.enclosure?.type ?? null,
      duration_seconds: parseItunesDuration(item.itunes?.duration),
      thumbnail_url: safeHttpUrl(item.itunes?.image) ?? feedImage,
      external_id: null,
      content_text: stripHtml(html).slice(0, MAX_CONTENT_CHARS),
    };
  }
  return {
    media_url: null,
    media_type: null,
    duration_seconds: null,
    thumbnail_url: null,
    external_id: null,
    content_text: itemContent(item),
  };
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
      feedImage: string | null;
      etag: string | null;
      lastModified: string | null;
    }
> {
  const headers: Record<string, string> = { "user-agent": USER_AGENT };
  if (source.etag) headers["if-none-match"] = source.etag;
  if (source.last_modified) headers["if-modified-since"] = source.last_modified;

  const response = await safeFetch(source.feed_url, {
    headers,
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });

  if (response.status === 304) {
    return { status: "not_modified" };
  }
  if (!response.ok) {
    throw new Error(`Feed responded with HTTP ${response.status}`);
  }

  const body = await response.text();
  const parser: Parser<{ itunes?: { image?: string } }, FeedItem> = new Parser({
    customFields: {
      item: [
        ["content:encoded", "contentEncoded"],
        ["media:group", "mediaGroup"],
        ["yt:videoId", "ytVideoId"],
      ],
    },
  });
  const feed = await parser.parseString(body);

  return {
    status: "ok",
    items: feed.items,
    feedImage: safeHttpUrl(feed.itunes?.image ?? feed.image?.url),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

// Best effort full-text extraction for items whose feed content is short.
async function extractFullText(url: string): Promise<string | null> {
  try {
    // SSRF guard: the extractor does its own fetching (we can't route it
    // through safeFetch), so validate the target host up front. This blocks a
    // feed whose item links point at internal addresses; the library still
    // follows its own redirects, which is residual risk.
    await assertPublicUrl(url);
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

  // One-way rss -> podcast reclassification for sources added before types
  // existed: podcasts are only recognizable from the feed body.
  let type = source.type;
  if (
    type === "rss" &&
    classifyFeed({ items: result.items }, source.feed_url) === "podcast"
  ) {
    type = "podcast";
    await storage.setSourceType(source.id, type);
  }

  const seen = new Set<string>();
  const rows: NewItem[] = [];
  for (const item of result.items) {
    const link = safeHttpUrl(item.link);
    const hash = canonicalHash(item.guid, link);
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    rows.push({
      source_id: source.id,
      guid: item.guid ?? null,
      url: link,
      canonical_hash: hash,
      url_hash: urlHash(link),
      title: item.title?.trim() || "(untitled)",
      author: item.creator ?? null,
      published_at: itemPublishedAt(item),
      ...mediaFields(type, item, result.feedImage),
    });
  }

  const inserted = await storage.upsertItems(rows);

  // Full-text extraction for new items with thin feed content; failures keep
  // the feed excerpt. Watch and episode pages extract junk, so media sources
  // keep the feed's own description.
  if (type !== "youtube" && type !== "podcast") {
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

// What the summary prompt calls the item, and what its text actually is —
// a video's content_text is its description, an episode's its show notes.
const SUMMARY_SUBJECTS: Record<SourceType, { noun: string; basis: string }> = {
  rss: { noun: "article", basis: "" },
  reddit: { noun: "post", basis: "" },
  youtube: { noun: "video", basis: " based on its description below" },
  podcast: { noun: "podcast episode", basis: " based on its show notes below" },
};

// Summarizes items that don't have a summary yet, capped per run; the rest
// are picked up on the next run.
export async function summarizePendingItems(
  storage: Storage,
): Promise<number> {
  const pending = await storage.listUnsummarizedItems(SUMMARY_CAP_PER_RUN);

  if (pending.length === 0) return 0;

  const llm = getLlm();
  const language = process.env.DIGEST_LANGUAGE || "en";
  let summarized = 0;

  for (const item of pending) {
    try {
      const { noun, basis } = SUMMARY_SUBJECTS[item.source_type];
      const prompt = [
        `Summarize this ${noun}${basis} in the language "${language}" so a reader gets the full picture without opening the ${noun}: the key facts, names, figures, dates and conclusions, in 4 to 7 sentences.`,
        `If the content is only a stub, a teaser or a bare link, summarize just what is actually there in 1 or 2 sentences instead; never invent details.`,
        `Style: plain, direct sentences without hype. Never use an em dash or en dash; use a comma, a colon, or two sentences instead.`,
        `Also list at most 3 short topic tags (in ${language === "en" ? "English" : `"${language}"`} or English, lowercase).`,
        "",
        `Title: ${item.title}`,
        `Content: ${(item.content_text ?? "").slice(0, SUMMARY_INPUT_CHARS)}`,
        "",
        `JSON shape: { "summary": string, "topics": string[] }`,
      ].join("\n");

      const { data } = await llm.callJson({
        model: llm.summaryModel,
        prompt,
        maxTokens: 800,
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
