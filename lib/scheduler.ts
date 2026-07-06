import { schedule, validate } from "node-cron";
import { runDigestJob, runIngestJob } from "./jobs.ts";

// Cron schedules, configurable via env: ingest every 6 hours, digest on Sunday
// at 17:00. Evaluated in DIGEST_TIMEZONE, so the digest lands at 17:00 local.
const INGEST_CRON = process.env.INGEST_CRON || "0 */6 * * *";
const DIGEST_CRON = process.env.DIGEST_CRON || "0 17 * * 0";
const TIMEZONE = process.env.DIGEST_TIMEZONE || "UTC";

// How late a delayed tick may still fire instead of being dropped (node-cron's
// default is 1s, which silently skips runs whenever the host hiccups at the
// scheduled second). Runs delayed longer than this are skipped until the next
// scheduled slot.
const MISSED_TOLERANCE_MS = 10 * 60 * 1000;

// Starts the in-process scheduler. node-cron's noOverlap prevents a slow run
// from overlapping the next tick. Errors are logged, never thrown, so one bad
// run does not kill the scheduler.
export function startScheduler(): void {
  for (const [expression, label] of [
    [INGEST_CRON, "INGEST_CRON"],
    [DIGEST_CRON, "DIGEST_CRON"],
  ] as const) {
    if (!validate(expression)) {
      throw new Error(`Invalid ${label} cron expression: "${expression}"`);
    }
  }

  schedule(
    INGEST_CRON,
    async () => {
      try {
        await runIngestJob();
      } catch (error) {
        console.error("Scheduled ingest failed:", error);
      }
    },
    {
      timezone: TIMEZONE,
      noOverlap: true,
      name: "ingest",
      missedExecutionTolerance: MISSED_TOLERANCE_MS,
    },
  );

  schedule(
    DIGEST_CRON,
    async () => {
      try {
        await runDigestJob();
      } catch (error) {
        console.error("Scheduled digest failed:", error);
      }
    },
    {
      timezone: TIMEZONE,
      noOverlap: true,
      name: "digest",
      missedExecutionTolerance: MISSED_TOLERANCE_MS,
    },
  );

  console.log(
    `Scheduler started (timezone ${TIMEZONE}): ingest "${INGEST_CRON}", digest "${DIGEST_CRON}".`,
  );
}
