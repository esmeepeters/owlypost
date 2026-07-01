import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

const patchSchema = z.object({
  status: z.enum(["active", "paused"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    // Reactivating also clears the failure state so ingestion retries.
    await getStorage().setSourceStatus(
      id,
      parsed.data.status,
      parsed.data.status === "active",
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await getStorage().deleteSource(id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
