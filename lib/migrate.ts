import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./storage/pool.ts";

const MIGRATIONS_DIR = fileURLToPath(new URL("../db/migrations/", import.meta.url));

// Applies every pending .sql file in db/migrations in filename order, each in
// its own transaction, tracking applied versions in schema_migrations. Safe to
// run repeatedly and safe against an already-populated database, since the
// migrations themselves are idempotent. Returns the versions applied this run.
export async function migrate(): Promise<string[]> {
  const pool = getPool();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`);

    const { rows } = await client.query<{ version: string }>(
      `select version from schema_migrations`,
    );
    const done = new Set(rows.map((row) => row.version));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          `insert into schema_migrations (version) values ($1)`,
          [file],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(
          `Migration ${file} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      applied.push(file);
      console.log(`Applied migration ${file}`);
    }
  } finally {
    client.release();
  }
  return applied;
}
