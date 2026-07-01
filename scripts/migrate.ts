// Applies pending database migrations.
// Run with: pnpm migrate (reads .env for DATABASE_URL).
import { migrate } from "../lib/migrate.ts";

migrate()
  .then((applied) => {
    console.log(
      applied.length
        ? `Applied ${applied.length} migration(s).`
        : "No pending migrations.",
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
