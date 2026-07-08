import { test } from "node:test";
import assert from "node:assert/strict";
import { retentionCutoff, retentionDays } from "./retention.ts";

test("retentionDays defaults to 30 when unset or blank", () => {
  assert.equal(retentionDays(undefined), 30);
  assert.equal(retentionDays(""), 30);
  assert.equal(retentionDays("  "), 30);
});

test("retentionDays parses a positive integer", () => {
  assert.equal(retentionDays("90"), 90);
  assert.equal(retentionDays("1"), 1);
});

test("retentionDays accepts 0 as the disable value", () => {
  assert.equal(retentionDays("0"), 0);
});

test("retentionDays rejects negatives, fractions and garbage", () => {
  assert.throws(() => retentionDays("-1"));
  assert.throws(() => retentionDays("1.5"));
  assert.throws(() => retentionDays("monthly"));
});

test("retentionCutoff subtracts whole days as an ISO instant", () => {
  const now = new Date("2026-07-08T12:00:00.000Z");
  assert.equal(retentionCutoff(now, 30), "2026-06-08T12:00:00.000Z");
  assert.equal(retentionCutoff(now, 1), "2026-07-07T12:00:00.000Z");
});
