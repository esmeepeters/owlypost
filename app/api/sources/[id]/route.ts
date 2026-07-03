import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

const patchSchema = z.union([
  z.object({ status: z.enum(["active", "paused"]) }),
  z.object({ categoryId: z.uuid().nullable() }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    if ("status" in parsed.data) {
      // Reactivating also clears the failure state so ingestion retries.
      await getStorage().setSourceStatus(
        id,
        parsed.data.status,
        parsed.data.status === "active",
      );
    } else {
      await getStorage().setSourceCategory(id, parsed.data.categoryId);
    }
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
