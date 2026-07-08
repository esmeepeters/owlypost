import { schedule, validate } from "node-cron";
import type { ScheduledTask } from "node-cron";
import { runCleanupJob, runDigestJob, runIngestJob } from "./jobs.ts";
import {
  DEFAULT_DIGEST_SCHEDULE,
  describeSchedule,
  toCronExpression,
} from "./digest-schedule.ts";
import { getStorage } from "./storage/index.ts";

// Ingest schedule, configurable via env: every 6 hours by default. The digest
// schedule lives in the database (digest_schedule table, editable in
// Settings) and is polled below. Both are evaluated in DIGEST_TIMEZONE.
const INGEST_CRON = process.env.INGEST_CRON || "0 */6 * * *";
// Data-retention cleanup (lib/retention.ts): daily, at a quiet hour by
// default. ITEM_CONTENT_RETENTION_DAYS=0 disables the job's work; the tick
// itself is harmless either way.
const CLEANUP_CRON = process.env.CLEANUP_CRON || "15 4 * * *";
const TIMEZONE = process.env.DIGEST_TIMEZONE || "UTC";

// How late a delayed tick may still fire instead of being dropped (node-cron's
// default is 1s, which silently skips runs whenever the host hiccups at the
// scheduled second). Runs delayed longer than this are skipped until the next
// scheduled slot.
const MISSED_TOLERANCE_MS = 10 * 60 * 1000;

// How often the worker re-reads the digest schedule from the database, so a
// change made in Settings takes effect without a restart.
const SCHEDULE_POLL_MS = 60_000;

let digestTask: ScheduledTask | null = null;
let digestCron: string | null = null;

// Reads the digest schedule and re-creates the cron task when it changed.
// destroy() removes the old task from node-cron's registry, so the "digest"
// name can be reused. In steady state (no change) this is a no-op.
async function syncDigestSchedule(): Promise<void> {
  const setting =
    (await getStorage().getDigestSchedule()) ?? DEFAULT_DIGEST_SCHEDULE;
  const expression = toCronExpression(setting);
  if (expression === digestCron) return;

  digestTask?.destroy();
  digestTask = schedule(
    expression,
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
  digestCron = expression;
  console.log(
    `Digest scheduled ${describeSchedule(setting)} ("${expression}", ${TIMEZONE}).`,
  );
}

// Starts the in-process scheduler. node-cron's noOverlap prevents a slow run
// from overlapping the next tick. Errors are logged, never thrown, so one bad
// run does not kill the scheduler.
export async function startScheduler(): Promise<void> {
  if (!validate(INGEST_CRON)) {
    throw new Error(`Invalid INGEST_CRON cron expression: "${INGEST_CRON}"`);
  }
  if (!validate(CLEANUP_CRON)) {
    throw new Error(`Invalid CLEANUP_CRON cron expression: "${CLEANUP_CRON}"`);
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
    CLEANUP_CRON,
    async () => {
      try {
        await runCleanupJob();
      } catch (error) {
        console.error("Scheduled cleanup failed:", error);
      }
    },
    {
      timezone: TIMEZONE,
      noOverlap: true,
      name: "cleanup",
      missedExecutionTolerance: MISSED_TOLERANCE_MS,
    },
  );

  // The first sync may throw (startup with an unreachable database should be
  // loud); afterwards a failed poll keeps the current schedule and only logs.
  await syncDigestSchedule();
  setInterval(() => {
    syncDigestSchedule().catch((error) => {
      console.error(
        "Digest schedule poll failed; keeping current schedule:",
        error,
      );
    });
  }, SCHEDULE_POLL_MS);

  console.log(
    `Scheduler started (timezone ${TIMEZONE}): ingest "${INGEST_CRON}", cleanup "${CLEANUP_CRON}".`,
  );
}
