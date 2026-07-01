// Environment-neutral job entry points. These wrap the core functions with a
// storage instance and logging, and are the single place every trigger (the
// scheduler container, the manual UI buttons, or any external scheduler) calls
// into. They depend on nothing environment-specific.
import { runDigest } from "./digest.ts";
import { runIngest } from "./ingest.ts";
import { getStorage } from "./storage/index.ts";
import type { DigestRunResult } from "./digest.ts";
import type { IngestStats } from "./ingest.ts";

export async function runIngestJob(): Promise<IngestStats> {
  const stats = await runIngest(getStorage());
  console.log("Ingest run finished:", JSON.stringify(stats));
  return stats;
}

export async function runDigestJob(): Promise<DigestRunResult> {
  const result = await runDigest(getStorage());
  console.log("Digest run finished:", JSON.stringify(result));
  return result;
}
