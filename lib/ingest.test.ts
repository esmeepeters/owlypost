import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalHash,
  normalizeUrl,
  planUrlHashBackfill,
  urlHash,
  type BackfillRow,
} from "./ingest.ts";

test("normalizeUrl strips utm_* params but keeps the rest", () => {
  assert.equal(
    normalizeUrl("https://example.com/post?utm_source=rss&UTM_Medium=feed&id=7"),
    "https://example.com/post?id=7",
  );
});

test("normalizeUrl strips the fragment", () => {
  assert.equal(
    normalizeUrl("https://example.com/post#section-2"),
    "https://example.com/post",
  );
});

test("normalizeUrl lowercases the host but not the path", () => {
  assert.equal(
    normalizeUrl("https://Example.COM/Posts/One"),
    "https://example.com/Posts/One",
  );
});

test("normalizeUrl returns non-URL input unchanged", () => {
  assert.equal(normalizeUrl("not a url"), "not a url");
});

test("canonicalHash prefers the guid over the url", () => {
  const withGuid = canonicalHash("guid-1", "https://example.com/post");
  const urlOnly = canonicalHash(null, "https://example.com/post");
  assert.notEqual(withGuid, urlOnly);
  assert.equal(canonicalHash("guid-1", "https://elsewhere.com"), withGuid);
});

test("canonicalHash falls back to the normalized url", () => {
  assert.equal(
    canonicalHash(null, "https://example.com/post?utm_source=rss"),
    canonicalHash(null, "https://example.com/post"),
  );
});

test("canonicalHash falls back to the url on a whitespace-only guid", () => {
  assert.equal(
    canonicalHash("  ", "https://example.com/post"),
    canonicalHash(null, "https://example.com/post"),
  );
});

test("canonicalHash is null when guid and url are both absent", () => {
  assert.equal(canonicalHash(null, null), null);
  assert.equal(canonicalHash(undefined, undefined), null);
});

test("urlHash ignores the guid difference that splits canonicalHash", () => {
  // The cross-feed case: two feeds carry the same article under different
  // guids; canonicalHash differs, urlHash must not.
  const url = "https://example.com/post";
  assert.notEqual(canonicalHash("feed-a-guid", url), canonicalHash("feed-b-guid", url));
  assert.equal(urlHash(url), urlHash(`${url}?utm_source=feed-b`));
});

test("urlHash is null without a url", () => {
  assert.equal(urlHash(null), null);
  assert.equal(urlHash(undefined), null);
  assert.equal(urlHash(""), null);
});

function row(
  id: string,
  sourceId: string,
  url: string,
  fetchedAt: string,
): BackfillRow {
  return { id, source_id: sourceId, url, fetched_at: fetchedAt };
}

test("planUrlHashBackfill hashes every row of a single-source group", () => {
  const plan = planUrlHashBackfill([
    row("1", "src-a", "https://example.com/post", "2026-06-01T00:00:00Z"),
    row("2", "src-a", "https://example.com/post#older", "2026-06-02T00:00:00Z"),
  ]);
  assert.equal(plan.length, 2);
  assert.equal(new Set(plan.map((p) => p.url_hash)).size, 1);
});

test("planUrlHashBackfill keeps only the earliest fetch of a multi-source group", () => {
  const plan = planUrlHashBackfill([
    row("late", "src-b", "https://example.com/post", "2026-06-03T00:00:00Z"),
    row("early", "src-a", "https://example.com/post", "2026-06-01T00:00:00Z"),
  ]);
  assert.deepEqual(
    plan.map((p) => p.id),
    ["early"],
  );
});

test("planUrlHashBackfill hashes distinct urls independently", () => {
  const plan = planUrlHashBackfill([
    row("1", "src-a", "https://example.com/one", "2026-06-01T00:00:00Z"),
    row("2", "src-b", "https://example.com/two", "2026-06-01T00:00:00Z"),
  ]);
  assert.equal(plan.length, 2);
});

test("planUrlHashBackfill returns nothing for empty input", () => {
  assert.deepEqual(planUrlHashBackfill([]), []);
});
