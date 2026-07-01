import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

const bodySchema = z.object({
  profileMd: z.string().max(20_000),
});

// Manual profile edits are first class. They deliberately do not bump
// updated_at: that timestamp marks the last synthesis, so feedback that
// arrived before a manual edit still gets incorporated on the next run
// (with the edited text as the base).
export async function PUT(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile." }, { status: 400 });
  }

  try {
    await getStorage().updateProfileManual(parsed.data.profileMd);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
