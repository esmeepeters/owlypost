import { PostgresStorage } from "./postgres.ts";
import type { Storage } from "./types.ts";

declare global {
  var __owlyStorage: Storage | undefined;
}

// The single storage instance for this process. Backed by Postgres today; the
// return type is the Storage interface so callers never depend on that.
export function getStorage(): Storage {
  if (!globalThis.__owlyStorage) {
    globalThis.__owlyStorage = new PostgresStorage();
  }
  return globalThis.__owlyStorage;
}

export type { Storage } from "./types.ts";
