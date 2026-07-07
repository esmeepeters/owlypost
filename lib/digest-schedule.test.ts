import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIGEST_SCHEDULE,
  describeSchedule,
  toCronExpression,
} from "./digest-schedule.ts";

test("default schedule reproduces the old DIGEST_CRON default", () => {
  assert.equal(toCronExpression(DEFAULT_DIGEST_SCHEDULE), "0 17 * * 0");
});

test("toCronExpression drops the weekday for daily", () => {
  assert.equal(
    toCronExpression({ frequency: "daily", day_of_week: 3, hour: 8, minute: 30 }),
    "30 8 * * *",
  );
});

test("toCronExpression keeps the weekday for weekly", () => {
  assert.equal(
    toCronExpression({ frequency: "weekly", day_of_week: 6, hour: 9, minute: 15 }),
    "15 9 * * 6",
  );
});

test("describeSchedule zero-pads hours and minutes", () => {
  assert.equal(
    describeSchedule({ frequency: "daily", day_of_week: 0, hour: 7, minute: 5 }),
    "daily at 07:05",
  );
});

test("describeSchedule names the weekday for weekly", () => {
  assert.equal(
    describeSchedule(DEFAULT_DIGEST_SCHEDULE),
    "weekly on Sunday at 17:00",
  );
});
