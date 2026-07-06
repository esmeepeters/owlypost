import assert from "node:assert/strict";
import { test } from "node:test";
import { sectionSlug } from "./slug.ts";

test("sectionSlug lowercases and hyphenates", () => {
  assert.equal(sectionSlug("AI & ML"), "ai-ml");
  assert.equal(sectionSlug("Tech"), "tech");
});

test("sectionSlug strips diacritics", () => {
  assert.equal(sectionSlug("Café Économie"), "cafe-economie");
});

test("sectionSlug trims leading/trailing separators", () => {
  assert.equal(sectionSlug("  News!  "), "news");
});

test("sectionSlug falls back when nothing remains", () => {
  assert.equal(sectionSlug("!!!"), "section");
});
