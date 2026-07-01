// Worker/scheduler process: applies pending migrations, then runs the ingest
// and digest jobs on a schedule. Run it as its own container (see
// docker-compose.yml) or under any process manager.
import { migrate } from "../lib/migrate.ts";
import { startScheduler } from "../lib/scheduler.ts";

async function main() {
  console.log("Worker starting…");
  const applied = await migrate();
  console.log(
    applied.length
      ? `Applied ${applied.length} migration(s).`
      : "Database schema is up to date.",
  );
  startScheduler();
  // node-cron keeps the event loop alive; the process stays up until stopped.
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
