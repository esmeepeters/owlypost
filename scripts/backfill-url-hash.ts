// One-off: assigns url_hash to items ingested before migration 0003, so
// cross-feed dedup also covers the existing backlog. In a URL group spanning
// multiple sources only the earliest-fetched item gets the hash; the other
// rows stay null forever (deleting them would cascade away digest history and
// feedback). Safe to re-run: a second pass finds nothing left to assign.
// Run with: pnpm backfill-url-hash (reads .env for DATABASE_URL).
import { planUrlHashBackfill } from "../lib/ingest.ts";
import { getStorage } from "../lib/storage/index.ts";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Set DATABASE_URL (e.g. in .env).");
    process.exit(1);
  }
  const storage = getStorage();

  const rows = await storage.listItemsMissingUrlHash();
  const plan = planUrlHashBackfill(rows);
  for (const entry of plan) {
    await storage.setItemUrlHash(entry.id, entry.url_hash);
  }

  console.log(
    `Assigned url_hash to ${plan.length} of ${rows.length} items; ` +
      `skipped ${rows.length - plan.length} pre-existing cross-feed duplicates.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
