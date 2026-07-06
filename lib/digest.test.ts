import assert from "node:assert/strict";
import { test } from "node:test";
import {
  capItemsProportionally,
  eligibilityRange,
  fixupSections,
  weekWindow,
  type DigestBody,
} from "./digest.ts";

test("weekWindow starts on Monday 00:00 in the digest timezone", () => {
  // Thursday 2026-06-11 10:00 UTC = Thursday 12:00 in Amsterdam (CEST).
  const now = new Date("2026-06-11T10:00:00Z");
  const { startUtc, weekStart, weekEnd } = weekWindow(now, "Europe/Amsterdam");
  assert.equal(weekStart, "2026-06-08");
  assert.equal(weekEnd, "2026-06-11");
  // Monday 00:00 Amsterdam (CEST, UTC+2) = Sunday 22:00 UTC.
  assert.equal(startUtc.toISOString(), "2026-06-07T22:00:00.000Z");
});

test("weekWindow handles the timezone date boundary", () => {
  // Sunday 23:30 UTC is already Monday 01:30 in Amsterdam.
  const now = new Date("2026-06-07T23:30:00Z");
  const { weekStart } = weekWindow(now, "Europe/Amsterdam");
  assert.equal(weekStart, "2026-06-08");
});

test("eligibilityRange spans the default 30 days up to now", () => {
  const now = new Date("2026-07-01T12:00:00Z");
  const { sinceUtc, untilUtc } = eligibilityRange(now);
  assert.equal(untilUtc, "2026-07-01T12:00:00.000Z");
  assert.equal(sinceUtc, "2026-06-01T12:00:00.000Z");
});

test("eligibilityRange respects a custom max age", () => {
  const now = new Date("2026-07-01T12:00:00Z");
  const { sinceUtc } = eligibilityRange(now, 7);
  assert.equal(sinceUtc, "2026-06-24T12:00:00.000Z");
});

function makeItems(sourceCounts: Record<string, number>) {
  const items = [];
  for (const [sourceId, count] of Object.entries(sourceCounts)) {
    for (let i = 0; i < count; i++) {
      items.push({
        source_id: sourceId,
        published_at: `2026-06-0${(i % 7) + 1}T0${i % 10}:00:00Z`,
        fetched_at: "2026-06-08T00:00:00Z",
      });
    }
  }
  return items;
}

test("capItemsProportionally keeps everything under the cap", () => {
  const items = makeItems({ a: 10, b: 5 });
  assert.equal(capItemsProportionally(items, 150).length, 15);
});

test("capItemsProportionally caps proportionally per source", () => {
  const items = makeItems({ big: 90, small: 10 });
  const capped = capItemsProportionally(items, 50);
  assert.equal(capped.length, 50);
  const bySource = Map.groupBy(capped, (item) => item.source_id);
  assert.equal(bySource.get("big")!.length, 45);
  assert.equal(bySource.get("small")!.length, 5);
});

const baseBody: DigestBody = {
  sections: [
    {
      category: "Tech",
      narrative_md: "things happened",
      items: [
        { item_id: "1", verdict: "must_read", reason: "great" },
        { item_id: "1", verdict: "skip", reason: "duplicate entry" },
        { item_id: "999", verdict: "worth_it", reason: "hallucinated id" },
      ],
    },
  ],
};

test("fixupSections drops duplicates and unknown ids, appends missing items", () => {
  const items = [
    { id: "1", categoryName: "Tech" },
    { id: "2", categoryName: "Tech" },
    { id: "3", categoryName: "News" },
  ];
  const fixed = fixupSections(baseBody, items);

  const allEntries = fixed.sections.flatMap((s) => s.items);
  const ids = allEntries.map((e) => e.item_id).sort();
  assert.deepEqual(ids, ["1", "2", "3"]);

  const appended = allEntries.find((e) => e.item_id === "2")!;
  assert.equal(appended.verdict, "skip");
  assert.equal(appended.reason, "not selected by the model");

  // Item 3's category had no section: one is created for it.
  const newsSection = fixed.sections.find((s) => s.category === "News")!;
  assert.equal(newsSection.items.length, 1);

  // The first occurrence of the duplicate wins.
  const kept = allEntries.find((e) => e.item_id === "1")!;
  assert.equal(kept.verdict, "must_read");
});
