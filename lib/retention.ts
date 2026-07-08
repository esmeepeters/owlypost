// Data retention. Runs on the cleanup schedule and clears the two payloads
// that are never read again: the raw article text of summarized items (the
// digest prompt and every page read only title/url/summary/topics) and the
// raw model response kept for failed digests. Item rows themselves are never
// deleted — digest_items and feedback cascade on item deletion, so deleting
// rows would destroy feedback history and old digests' item lists.
import type { Storage } from "./storage/index.ts";

// Days after fetch before an item's content_text is cleared. Matches
// MAX_ITEM_AGE_DAYS in digest.ts: past this window an item can no longer
// enter a digest, and stripping is further guarded on the summary already
// existing.
const DEFAULT_RETENTION_DAYS = 30;

export type RetentionStats = {
  disabled: boolean;
  strippedItems: number;
  clearedRawResponses: number;
};

// Parses ITEM_CONTENT_RETENTION_DAYS; 0 disables retention entirely.
export function retentionDays(env: string | undefined): number {
  if (env === undefined || env.trim() === "") return DEFAULT_RETENTION_DAYS;
  const parsed = Number(env);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ITEM_CONTENT_RETENTION_DAYS: "${env}"`);
  }
  return parsed;
}

export function retentionCutoff(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function runRetention(
  storage: Storage,
  now: Date = new Date(),
): Promise<RetentionStats> {
  const days = retentionDays(process.env.ITEM_CONTENT_RETENTION_DAYS);
  if (days === 0) {
    return { disabled: true, strippedItems: 0, clearedRawResponses: 0 };
  }

  const cutoff = retentionCutoff(now, days);
  const [strippedItems, clearedRawResponses] = await Promise.all([
    storage.stripItemContentBefore(cutoff),
    storage.clearFailedDigestRawResponses(cutoff),
  ]);
  return { disabled: false, strippedItems, clearedRawResponses };
}
