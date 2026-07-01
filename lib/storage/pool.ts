import pg, { type Pool } from "pg";

const { types } = pg;

// PostgREST returned every timestamp as an ISO string and the app compares and
// serialises them as strings throughout. node-postgres parses timestamptz to a
// Date by default, so normalise back to ISO strings, and keep `date` columns as
// plain YYYY-MM-DD strings (week_start / week_end) to preserve behaviour.
types.setTypeParser(1184, (value) =>
  value === null ? null : new Date(value).toISOString(),
); // timestamptz
types.setTypeParser(1082, (value) => value); // date -> keep as string

declare global {
  // Reused across HMR reloads in Next dev and across requests, so a single
  // process holds a single pool.
  var __owlyPool: Pool | undefined;
}

// Many managed Postgres providers require TLS; the bundled local container does
// not. Enable it when the connection string asks for it.
function sslConfig() {
  const url = process.env.DATABASE_URL ?? "";
  const mode = process.env.PGSSLMODE;
  if (mode === "disable") return undefined;
  if (
    mode === "require" ||
    mode === "no-verify" ||
    /sslmode=(require|no-verify|verify-ca|verify-full)/.test(url)
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalThis.__owlyPool) {
    globalThis.__owlyPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    });
  }
  return globalThis.__owlyPool;
}
