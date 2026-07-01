import Parser from "rss-parser";

export type FeedPreviewItem = {
  title: string;
  url: string | null;
  publishedAt: string | null;
};

export type DetectedFeed = {
  feedUrl: string;
  title: string;
  siteUrl: string | null;
  recentItems: FeedPreviewItem[];
};

export type DetectResult =
  | { ok: true; feed: DetectedFeed }
  | { ok: false; tried: string[]; message: string };

export type Fetcher = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

const USER_AGENT =
  "OwlyPost/0.1 (personal feed reader; +https://owly-post.com)";
const FETCH_TIMEOUT_MS = 10_000;
const PROBE_PATHS = [
  "/feed",
  "/rss",
  "/rss.xml",
  "/atom.xml",
  "/feed.xml",
  "/index.xml",
];

function normalizeInput(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

async function fetchWithTimeout(
  fetcher: Fetcher,
  url: string,
): Promise<Response> {
  return fetcher(url, {
    headers: { "user-agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

function looksLikeFeed(contentType: string | null, body: string): boolean {
  if (contentType && /xml/i.test(contentType)) return true;
  const start = body.trimStart().slice(0, 200);
  return (
    start.startsWith("<?xml") ||
    start.startsWith("<rss") ||
    start.startsWith("<feed")
  );
}

async function parseFeedBody(
  feedUrl: string,
  body: string,
): Promise<DetectedFeed | null> {
  try {
    const parser = new Parser();
    const feed = await parser.parseString(body);
    const host = new URL(feedUrl).host;
    return {
      feedUrl,
      title: feed.title?.trim() || host,
      siteUrl: feed.link ?? null,
      recentItems: feed.items.slice(0, 3).map((item) => ({
        title: item.title?.trim() || "(untitled)",
        url: item.link ?? null,
        publishedAt: item.isoDate ?? item.pubDate ?? null,
      })),
    };
  } catch {
    return null;
  }
}

// Fetches a candidate URL and returns the parsed feed when it is one.
async function tryFeedUrl(
  fetcher: Fetcher,
  url: string,
): Promise<DetectedFeed | null> {
  try {
    const response = await fetchWithTimeout(fetcher, url);
    if (!response.ok) return null;
    const body = await response.text();
    if (!looksLikeFeed(response.headers.get("content-type"), body)) {
      return null;
    }
    return await parseFeedBody(url, body);
  } catch {
    return null;
  }
}

// Extracts feed URLs from <link rel="alternate"> tags, resolved against the
// page URL, in document order.
export function extractFeedLinks(html: string, baseUrl: string): string[] {
  const results: string[] = [];
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if (!/rel=["']?alternate["']?/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml["']?/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      results.push(new URL(href, baseUrl).toString());
    } catch {
      // Ignore unresolvable hrefs.
    }
  }
  return results;
}

function youtubeChannelFeed(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

async function detectYoutube(
  fetcher: Fetcher,
  url: URL,
): Promise<DetectResult> {
  const tried: string[] = [];

  const channelMatch = url.pathname.match(/^\/channel\/([\w-]+)/);
  if (channelMatch) {
    const feedUrl = youtubeChannelFeed(channelMatch[1]);
    tried.push(feedUrl);
    const feed = await tryFeedUrl(fetcher, feedUrl);
    if (feed) return { ok: true, feed };
    return {
      ok: false,
      tried,
      message: "The YouTube channel feed could not be fetched.",
    };
  }

  const handleMatch = url.pathname.match(/^\/(@[\w.-]+)/);
  if (handleMatch) {
    tried.push(url.toString());
    try {
      const response = await fetchWithTimeout(fetcher, url.toString());
      const html = await response.text();
      // The canonical link identifies the page's own channel; a bare
      // "channelId" match can belong to a related channel elsewhere on the page.
      const channelId =
        html.match(
          /<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)"/,
        )?.[1] ??
        html.match(/"channelId":"(UC[\w-]+)"/)?.[1] ??
        html.match(/youtube\.com\/channel\/(UC[\w-]+)/)?.[1];
      if (channelId) {
        const feedUrl = youtubeChannelFeed(channelId);
        tried.push(feedUrl);
        const feed = await tryFeedUrl(fetcher, feedUrl);
        if (feed) return { ok: true, feed };
      }
    } catch {
      // Fall through to the failure result.
    }
    return {
      ok: false,
      tried,
      message:
        "Could not extract a channel id from this YouTube page. Try the channel URL of the form youtube.com/channel/UC…",
    };
  }

  return {
    ok: false,
    tried: [url.toString()],
    message:
      "Only YouTube channel URLs (/channel/… or /@handle) are supported.",
  };
}

async function detectReddit(
  fetcher: Fetcher,
  url: URL,
): Promise<DetectResult> {
  const path = url.pathname.replace(/\/$/, "");
  const feedUrl = `${url.origin}${path}.rss`;
  const feed = await tryFeedUrl(fetcher, feedUrl);
  if (feed) return { ok: true, feed };
  return {
    ok: false,
    tried: [feedUrl],
    message: "The subreddit feed could not be fetched.",
  };
}

// Detects a feed for any user-supplied URL. Pure aside from the injected
// fetcher, so tests can run without a network.
export async function detectFeed(
  input: string,
  fetcher: Fetcher = fetch,
): Promise<DetectResult> {
  const normalized = normalizeInput(input);

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return {
      ok: false,
      tried: [],
      message: `Not a valid URL: ${input}`,
    };
  }

  const host = url.hostname.toLowerCase();
  if (host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") {
    return detectYoutube(fetcher, url);
  }
  if (/(^|\.)reddit\.com$/.test(host) && /^\/r\/[^/]+/.test(url.pathname)) {
    return detectReddit(fetcher, url);
  }

  const tried: string[] = [url.toString()];

  let response: Response;
  let body: string;
  try {
    response = await fetchWithTimeout(fetcher, url.toString());
    body = await response.text();
  } catch {
    return {
      ok: false,
      tried,
      message: "The URL could not be fetched (network error or timeout).",
    };
  }

  // 1. The URL itself is a feed.
  if (response.ok && looksLikeFeed(response.headers.get("content-type"), body)) {
    const feed = await parseFeedBody(url.toString(), body);
    if (feed) return { ok: true, feed };
  }

  // 2. <link rel="alternate"> discovery in the HTML.
  const linkCandidates = extractFeedLinks(body, url.toString());
  if (linkCandidates.length > 0) {
    const candidate = linkCandidates[0];
    tried.push(candidate);
    const feed = await tryFeedUrl(fetcher, candidate);
    if (feed) return { ok: true, feed };
  }

  // 3. Well-known paths on the origin (covers Substack among others).
  for (const path of PROBE_PATHS) {
    const candidate = `${url.origin}${path}`;
    tried.push(candidate);
    const feed = await tryFeedUrl(fetcher, candidate);
    if (feed) return { ok: true, feed };
  }

  return {
    ok: false,
    tried,
    message:
      "No feed found at this URL. Pages without an RSS or Atom feed are not supported.",
  };
}
