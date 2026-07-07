import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

const bodySchema = z.object({
  frequency: z.enum(["daily", "weekly"]),
  // Cron convention (0 = Sunday); sent for daily too, just ignored there.
  dayOfWeek: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export async function PUT(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid schedule." }, { status: 400 });
  }

  try {
    await getStorage().updateDigestSchedule({
      frequency: parsed.data.frequency,
      day_of_week: parsed.data.dayOfWeek,
      hour: parsed.data.hour,
      minute: parsed.data.minute,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
