import { NextResponse } from "next/server";
import { runDigestJob } from "@/lib/jobs";

// "Generate digest now": runs the digest job in-process (fire-and-forget); the
// worker runs the same job on a cron.
export async function POST() {
  void runDigestJob().catch((error) =>
    console.error("Digest run failed:", error),
  );
  return NextResponse.json({ ok: true });
}
