import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

const ratingFields = {
  rating: z.enum(["up", "down"]),
  comment: z.string().max(2000).nullish(),
};

// Either feedback on an item's verdict or on a section's narrative summary.
const bodySchema = z.union([
  z.object({ digestItemId: z.uuid(), ...ratingFields }),
  z.object({
    digestId: z.uuid(),
    category: z.string().min(1).max(200),
    ...ratingFields,
  }),
]);

// One feedback row per digest item / per digest section, editable afterwards.
export async function PUT(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  }
  const { rating, comment } = parsed.data;
  const trimmedComment = comment?.trim() || null;

  try {
    if ("digestItemId" in parsed.data) {
      await getStorage().upsertFeedback(
        parsed.data.digestItemId,
        rating,
        trimmedComment,
      );
    } else {
      await getStorage().upsertSectionFeedback(
        parsed.data.digestId,
        parsed.data.category,
        rating,
        trimmedComment,
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
