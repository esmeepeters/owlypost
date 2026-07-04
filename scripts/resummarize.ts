// Clears the summaries of this week's items and regenerates them, so a prompt
// change in summarizePendingItems also applies to already-ingested items.
// Run with: pnpm resummarize (reads .env for DATABASE_URL and the LLM
// provider key).
import { weekWindow } from "../lib/digest.ts";
import { summarizePendingItems } from "../lib/ingest.ts";
import { getStorage } from "../lib/storage/index.ts";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Set DATABASE_URL (e.g. in .env).");
    process.exit(1);
  }
  const storage = getStorage();

  const timeZone = process.env.DIGEST_TIMEZONE || "Europe/Amsterdam";
  const { startUtc, weekStart } = weekWindow(new Date(), timeZone);
  const cleared = await storage.clearItemSummariesSince(startUtc.toISOString());
  console.log(`Cleared ${cleared} summaries for the week of ${weekStart}.`);

  let total = 0;
  let batch: number;
  do {
    batch = await summarizePendingItems(storage);
    total += batch;
    if (batch > 0) console.log(`Summarized ${total} items so far…`);
  } while (batch > 0);

  console.log(`Done: ${total} items re-summarized.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
