import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyFeed,
  detectFeed,
  extractFeedLinks,
  type Fetcher,
} from "./feed-detect.ts";

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
  assert.equal(result.feed.kind, "rss");
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
  assert.equal(result.feed.kind, "youtube");
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
  assert.equal(result.feed.kind, "reddit");
});

const PODCAST_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Example Podcast</title>
    <link>https://pod.example.com</link>
    <itunes:image href="https://pod.example.com/cover.jpg"/>
    <item>
      <title>Episode 2</title>
      <link>https://pod.example.com/2</link>
      <enclosure url="https://cdn.example.com/2.mp3" length="1" type="audio/mpeg"/>
    </item>
    <item>
      <title>Episode 1</title>
      <link>https://pod.example.com/1</link>
      <enclosure url="https://cdn.example.com/1.mp3" length="1" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

test("classifyFeed goes by URL host for YouTube and Reddit", () => {
  const feed = { items: [] };
  assert.equal(
    classifyFeed(feed, "https://www.youtube.com/feeds/videos.xml?channel_id=x"),
    "youtube",
  );
  assert.equal(
    classifyFeed(feed, "https://www.reddit.com/r/selfhosted.rss"),
    "reddit",
  );
});

test("classifyFeed calls a majority of audio enclosures a podcast", () => {
  const audio = { enclosure: { url: "https://c.example/e.mp3", type: "audio/mpeg" } };
  const plain = {};
  assert.equal(
    classifyFeed({ items: [audio, audio, plain] }, "https://pod.example.com/feed"),
    "podcast",
  );
  assert.equal(
    classifyFeed({ items: [audio, plain, plain] }, "https://pod.example.com/feed"),
    "rss",
  );
});

test("classifyFeed recognizes audio by file extension when type is missing", () => {
  const feed = { items: [{ enclosure: { url: "https://c.example/e.m4a?x=1" } }] };
  assert.equal(classifyFeed(feed, "https://pod.example.com/feed"), "podcast");
});

test("classifyFeed treats non-audio enclosures and empty feeds as rss", () => {
  const video = { enclosure: { url: "https://c.example/v.mp4", type: "video/mp4" } };
  assert.equal(classifyFeed({ items: [video] }, "https://a.example/feed"), "rss");
  assert.equal(classifyFeed({ items: [] }, "https://a.example/feed"), "rss");
});

test("detects a podcast feed and reports its kind", async () => {
  const fetcher = fakeFetcher({
    "https://pod.example.com/feed": {
      body: PODCAST_BODY,
      contentType: "application/rss+xml",
    },
  });
  const result = await detectFeed("https://pod.example.com/feed", fetcher);
  assert.ok(result.ok);
  assert.equal(result.feed.kind, "podcast");
});

test("resolves an Apple Podcasts show page via the iTunes lookup API", async () => {
  const fetcher = fakeFetcher({
    "https://itunes.apple.com/lookup?id=123456": {
      body: JSON.stringify({
        results: [{ feedUrl: "https://pod.example.com/feed" }],
      }),
      contentType: "application/json",
    },
    "https://pod.example.com/feed": {
      body: PODCAST_BODY,
      contentType: "application/rss+xml",
    },
  });
  const result = await detectFeed(
    "https://podcasts.apple.com/us/podcast/example/id123456",
    fetcher,
  );
  assert.ok(result.ok);
  assert.equal(result.feed.feedUrl, "https://pod.example.com/feed");
  assert.equal(result.feed.kind, "podcast");
});

test("rejects an Apple Podcasts URL without a show id", async () => {
  const result = await detectFeed(
    "https://podcasts.apple.com/us/browse",
    fakeFetcher({}),
  );
  assert.ok(!result.ok);
  assert.match(result.message, /show id/i);
});

test("reports failure when the iTunes lookup has no feed", async () => {
  const fetcher = fakeFetcher({
    "https://itunes.apple.com/lookup?id=999": {
      body: JSON.stringify({ results: [] }),
      contentType: "application/json",
    },
  });
  const result = await detectFeed(
    "https://podcasts.apple.com/us/podcast/gone/id999",
    fetcher,
  );
  assert.ok(!result.ok);
  assert.ok(result.tried.includes("https://itunes.apple.com/lookup?id=999"));
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
