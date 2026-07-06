import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDigestDate,
  formatWeekRange,
  formatWeekSubject,
} from "./format.ts";

test("formatDigestDate keeps ISO for en", () => {
  assert.equal(formatDigestDate("2026-06-29", "en"), "2026-06-29");
});

test("formatDigestDate renders dd-mm-yyyy for nl", () => {
  assert.equal(formatDigestDate("2026-06-29", "nl"), "29-06-2026");
  assert.equal(formatDigestDate("2026-07-05", "nl"), "05-07-2026");
});

test("formatDigestDate falls back to ISO on an invalid language code", () => {
  assert.equal(formatDigestDate("2026-06-29", "not a locale"), "2026-06-29");
});

test("formatWeekRange keeps current English output for en", () => {
  assert.equal(
    formatWeekRange("2026-06-29", "2026-07-05", "en"),
    "Week of 2026-06-29 – 2026-07-05",
  );
});

test("formatWeekRange renders Dutch label, dates and separator for nl", () => {
  assert.equal(
    formatWeekRange("2026-06-29", "2026-07-05", "nl"),
    "Week van 29-06-2026 t/m 05-07-2026",
  );
});

test("formatWeekRange falls back to English labels for unknown languages", () => {
  assert.equal(
    formatWeekRange("2026-06-29", "2026-07-05", "fr"),
    "Week of 29/06/2026 – 05/07/2026",
  );
});

test("formatWeekSubject renders the lowercase variant per language", () => {
  assert.equal(formatWeekSubject("2026-06-29", "en"), "week of 2026-06-29");
  assert.equal(formatWeekSubject("2026-06-29", "nl"), "week van 29-06-2026");
});
