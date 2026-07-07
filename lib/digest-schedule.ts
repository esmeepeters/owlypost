// The digest delivery schedule as stored in the digest_schedule table
// (source of truth, editable in Settings) and its translation to the cron
// expression the worker schedules. Pure functions, no I/O.

import type { DigestFrequency } from "./types.ts";

export type DigestScheduleSetting = {
  frequency: DigestFrequency;
  // Cron convention (0 = Sunday); ignored when frequency is "daily".
  day_of_week: number;
  hour: number;
  minute: number;
};

// Matches the row seeded by migration 0006 (the old DIGEST_CRON default:
// weekly, Sunday, 17:00). Used when the row is missing, which only happens
// against a database that predates the migration.
export const DEFAULT_DIGEST_SCHEDULE: DigestScheduleSetting = {
  frequency: "weekly",
  day_of_week: 0,
  hour: 17,
  minute: 0,
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function toCronExpression(setting: DigestScheduleSetting): string {
  const { frequency, day_of_week, hour, minute } = setting;
  return frequency === "daily"
    ? `${minute} ${hour} * * *`
    : `${minute} ${hour} * * ${day_of_week}`;
}

export function describeSchedule(setting: DigestScheduleSetting): string {
  const time = `${String(setting.hour).padStart(2, "0")}:${String(setting.minute).padStart(2, "0")}`;
  return setting.frequency === "daily"
    ? `daily at ${time}`
    : `weekly on ${WEEKDAYS[setting.day_of_week]} at ${time}`;
}
