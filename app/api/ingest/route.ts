import { NextResponse } from "next/server";
import { runIngestJob } from "@/lib/jobs";

// "Fetch now": runs the ingest job in-process. `next start` is a long-lived
// server, so a fire-and-forget run keeps going after the response and the
// button returns immediately. The worker runs the same job on a cron.
export async function POST() {
  void runIngestJob().catch((error) =>
    console.error("Ingest run failed:", error),
  );
  return NextResponse.json({ ok: true });
}
