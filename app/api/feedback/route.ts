import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

const bodySchema = z.object({
  digestItemId: z.uuid(),
  rating: z.enum(["up", "down"]),
  comment: z.string().max(2000).nullish(),
});

// One feedback row per digest item, editable afterwards.
export async function PUT(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  }
  const { digestItemId, rating, comment } = parsed.data;

  try {
    await getStorage().upsertFeedback(
      digestItemId,
      rating,
      comment?.trim() || null,
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
