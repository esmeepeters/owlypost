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

// Shared task shape: noOverlap prevents a slow run from overlapping the next
// tick; errors are logged, never thrown, so one bad run does not kill the
// scheduler.
function scheduleJob(
  name: string,
  expression: string,
  job: () => Promise<unknown>,
): ScheduledTask {
  return schedule(
    expression,
    async () => {
      try {
        await job();
      } catch (error) {
        console.error(`Scheduled ${name} failed:`, error);
      }
    },
    {
      timezone: TIMEZONE,
      noOverlap: true,
      name,
      missedExecutionTolerance: MISSED_TOLERANCE_MS,
    },
  );
}

// Reads the digest schedule and re-creates the cron task when it changed.
// destroy() removes the old task from node-cron's registry, so the "digest"
// name can be reused. In steady state (no change) this is a no-op.
async function syncDigestSchedule(): Promise<void> {
  const setting =
    (await getStorage().getDigestSchedule()) ?? DEFAULT_DIGEST_SCHEDULE;
  const expression = toCronExpression(setting);
  if (expression === digestCron) return;

  digestTask?.destroy();
  digestTask = scheduleJob("digest", expression, runDigestJob);
  digestCron = expression;
  console.log(
    `Digest scheduled ${describeSchedule(setting)} ("${expression}", ${TIMEZONE}).`,
  );
}

// Starts the in-process scheduler.
export async function startScheduler(): Promise<void> {
  if (!validate(INGEST_CRON)) {
    throw new Error(`Invalid INGEST_CRON cron expression: "${INGEST_CRON}"`);
  }
  if (!validate(CLEANUP_CRON)) {
    throw new Error(`Invalid CLEANUP_CRON cron expression: "${CLEANUP_CRON}"`);
  }

  scheduleJob("ingest", INGEST_CRON, runIngestJob);
  scheduleJob("cleanup", CLEANUP_CRON, runCleanupJob);

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
