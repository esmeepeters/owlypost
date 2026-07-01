import assert from "node:assert/strict";
import { test } from "node:test";
import { detectFeed, extractFeedLinks, type Fetcher } from "./feed-detect.ts";

const RSS_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com</link>
    <item><title>First post</title><link>https://example.com/1</link><pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate></item>
    <item><title>Second post</title><link>https://example.com/2</link></item>
    <item><title>Third post</title><link>https://example.com/3</link></item>
    <item><title>Fourth post</title><link>https://example.com/4</link></item>
  </channel>
</rss>`;

const ATOM_BODY = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Video Channel</title>
  <link href="https://www.youtube.com/channel/UCabc123"/>
  <entry><title>A video</title><link href="https://www.youtube.com/watch?v=x"/></entry>
</feed>`;

// Builds a fetcher that serves canned responses by exact URL and 404s
// everything else, recording every requested URL.
function fakeFetcher(
  routes: Record<string, { body: string; contentType?: string }>,
): Fetcher & { requested: string[] } {
  const requested: string[] = [];
  const fetcher = (async (url: string) => {
    requested.push(url);
    const route = routes[url];
    if (!route) {
      return new Response("not found", { status: 404 });
    }
    return new Response(route.body, {
      status: 200,
      headers: { "content-type": route.contentType ?? "text/html" },
    });
  }) as Fetcher & { requested: string[] };
  fetcher.requested = requested;
  return fetcher;
}

test("detects a direct feed URL by content type", async () => {
  const fetcher = fakeFetcher({
    "https://example.com/feed.xml": {
      body: RSS_BODY,
      contentType: "application/rss+xml",
    },
  });
  const result = await detectFeed("https://example.com/feed.xml", fetcher);
  assert.ok(result.ok);
  assert.equal(result.feed.title, "Example Feed");
  assert.equal(result.feed.feedUrl, "https://example.com/feed.xml");
  assert.equal(result.feed.recentItems.length, 3);
  assert.equal(result.feed.recentItems[0].title, "First post");
});

test("detects a feed served as text/plain by sniffing the body", async () => {
  const fetcher = fakeFetcher({
    "https://example.com/feed": { body: RSS_BODY, contentType: "text/plain" },
  });
  const result = await detectFeed("https://example.com/feed", fetcher);
  assert.ok(result.ok);
});

test("normalizes input without a scheme", async () => {
  const fetcher = fakeFetcher({
    "https://example.com/feed.xml": {
      body: RSS_BODY,
      contentType: "application/xml",
    },
  });
  const result = await detectFeed("example.com/feed.xml", fetcher);
  assert.ok(result.ok);
});

test("discovers a feed via link rel=alternate, resolving relative URLs", async () => {
  const html = `<html><head>
    <link rel="alternate" type="application/rss+xml" title="RSS" href="/blog/feed.xml">
    </head><body>hi</body></html>`;
  const fetcher = fakeFetcher({
    "https://example.com/": { body: html },
    "https://example.com/blog/feed.xml": {
      body: RSS_BODY,
      contentType: "application/rss+xml",
    },
  });
  const result = await detectFeed("https://example.com", fetcher);
  assert.ok(result.ok);
  assert.equal(result.feed.feedUrl, "https://example.com/blog/feed.xml");
});

test("extractFeedLinks returns matches in document order", () => {
  const html = `
    <link rel="alternate" type="application/atom+xml" href="https://a.example/atom">
    <link rel="stylesheet" href="/styles.css">
    <link rel="alternate" type="application/rss+xml" href="/rss">`;
  const links = extractFeedLinks(html, "https://b.example/page");
  assert.deepEqual(links, ["https://a.example/atom", "https://b.example/rss"]);
});

test("falls back to probing well-known paths (Substack pattern)", async () => {
  const fetcher = fakeFetcher({
    "https://newsletter.example.com/": { body: "<html>no link tags</html>" },
    "https://newsletter.example.com/feed": {
      body: RSS_BODY,
      contentType: "application/rss+xml",
    },
  });
  const result = await detectFeed("https://newsletter.example.com", fetcher);
  assert.ok(result.ok);
  assert.equal(result.feed.feedUrl, "https://newsletter.example.com/feed");
});

test("builds the YouTube feed directly from a /channel/ URL", async () => {
  const feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=UCabc123";
  const fetcher = fakeFetcher({
    [feedUrl]: { body: ATOM_BODY, contentType: "application/atom+xml" },
  });
  const result = await detectFeed(
    "https://www.youtube.com/channel/UCabc123",
    fetcher,
  );
  assert.ok(result.ok);
  assert.equal(result.feed.feedUrl, feedUrl);
  // The channel page itself is never fetched.
  assert.deepEqual(fetcher.requested, [feedUrl]);
});

test("extracts the channel id from a YouTube @handle page", async () => {
  const feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=UCxyz789";
  const fetcher = fakeFetcher({
    "https://www.youtube.com/@somecreator": {
      body: `<html>..."channelId":"UCxyz789"...</html>`,
    },
    [feedUrl]: { body: ATOM_BODY, contentType: "application/atom+xml" },
  });
  const result = await detectFeed(
    "https://www.youtube.com/@somecreator",
    fetcher,
  );
  assert.ok(result.ok);
  assert.equal(result.feed.feedUrl, feedUrl);
});

test("appends .rss for subreddit URLs", async () => {
  const fetcher = fakeFetcher({
    "https://www.reddit.com/r/selfhosted.rss": {
      body: ATOM_BODY,
      contentType: "application/atom+xml",
    },
  });
  const result = await detectFeed(
    "https://www.reddit.com/r/selfhosted/",
    fetcher,
  );
  assert.ok(result.ok);
  assert.equal(
    result.feed.feedUrl,
    "https://www.reddit.com/r/selfhosted.rss",
  );
});

test("returns a structured error listing every URL tried", async () => {
  const fetcher = fakeFetcher({
    "https://nofeed.example.com/": { body: "<html>nothing here</html>" },
  });
  const result = await detectFeed("https://nofeed.example.com", fetcher);
  assert.ok(!result.ok);
  assert.match(result.message, /not supported/i);
  assert.ok(result.tried.includes("https://nofeed.example.com/"));
  assert.ok(result.tried.includes("https://nofeed.example.com/feed"));
  assert.ok(result.tried.includes("https://nofeed.example.com/index.xml"));
});

test("rejects garbage input", async () => {
  const result = await detectFeed("ht!tp://%%%", fakeFetcher({}));
  assert.ok(!result.ok);
});
