import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";
import { isUniqueViolation } from "@/lib/storage/postgres";

const bodySchema = z.object({
  name: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Category name is required." },
      { status: 400 },
    );
  }

  try {
    await getStorage().insertCategory(parsed.data.name);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A category with this name already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
