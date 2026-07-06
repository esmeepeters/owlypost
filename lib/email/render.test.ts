import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDigestEmailHtml } from "./render.ts";
import type { EmailDigest } from "./types.ts";

const digest: EmailDigest = {
  digestId: "d1",
  weekStart: "2026-06-29",
  weekEnd: "2026-07-05",
  sections: [
    {
      category: "AI & ML",
      narrativeMd: "A **busy** week.",
      items: [
        {
          digestItemId: "a",
          title: "Great post",
          url: "https://example.com/great",
          sourceTitle: "Blog",
          verdict: "must_read",
          reason: "worth your time",
        },
        {
          digestItemId: "b",
          title: "Filler post",
          url: "https://example.com/filler",
          sourceTitle: "Blog",
          verdict: "skip",
          reason: "nothing new",
        },
      ],
    },
    {
      category: "News",
      narrativeMd: "Quiet on this front.",
      items: [
        {
          digestItemId: "c",
          title: "Old news",
          url: null,
          sourceTitle: "Paper",
          verdict: "skip",
          reason: "already covered",
        },
      ],
    },
  ],
};

test("skip items are not rendered", () => {
  const html = renderDigestEmailHtml(digest, "http://localhost:3000");
  assert.ok(html.includes("Great post"));
  assert.ok(!html.includes("Filler post"));
  assert.ok(!html.includes("Old news"));
});

test("item titles link to the article; rate link anchors into the app", () => {
  const html = renderDigestEmailHtml(digest, "http://localhost:3000");
  assert.ok(html.includes('href="https://example.com/great"'));
  assert.ok(html.includes("http://localhost:3000/digests/d1#item-a"));
});

test("all-skip section still renders header, narrative and summary rate link", () => {
  const html = renderDigestEmailHtml(digest, "http://localhost:3000");
  assert.ok(html.includes("News"));
  assert.ok(html.includes("Quiet on this front."));
  assert.ok(html.includes("http://localhost:3000/digests/d1#section-news"));
  assert.ok(html.includes("#section-ai-ml"));
});

test("items render without card borders", () => {
  const html = renderDigestEmailHtml(digest, "http://localhost:3000");
  assert.ok(!html.includes("border:1px solid"));
});

test("the edition line follows DIGEST_LANGUAGE", () => {
  const previous = process.env.DIGEST_LANGUAGE;
  try {
    process.env.DIGEST_LANGUAGE = "nl";
    assert.ok(
      renderDigestEmailHtml(digest, "http://localhost:3000").includes(
        "Week van 29-06-2026 t/m 05-07-2026",
      ),
    );
    process.env.DIGEST_LANGUAGE = "en";
    assert.ok(
      renderDigestEmailHtml(digest, "http://localhost:3000").includes(
        "Week of 2026-06-29 – 2026-07-05",
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.DIGEST_LANGUAGE;
    else process.env.DIGEST_LANGUAGE = previous;
  }
});

test("a trailing slash in the site URL does not double up in links", () => {
  const html = renderDigestEmailHtml(digest, "http://localhost:3000/");
  assert.ok(html.includes("http://localhost:3000/digests/d1"));
  assert.ok(!html.includes("http://localhost:3000//"));
});

test("quiet week renders the message and no sections", () => {
  const html = renderDigestEmailHtml(
    {
      digestId: "d2",
      weekStart: "2026-07-06",
      weekEnd: "2026-07-12",
      quietMessage: "Nothing to show this week.",
      sections: [],
    },
    "http://localhost:3000",
  );
  assert.ok(html.includes("Nothing to show this week."));
  assert.ok(!html.includes("<h2"));
});
