import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";
import { isUniqueViolation } from "@/lib/storage/postgres";

const bodySchema = z.object({
  name: z.string().trim().min(1),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Category name is required." },
      { status: 400 },
    );
  }

  let updated;
  try {
    updated = await getStorage().updateCategory(id, parsed.data.name);
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
  if (!updated) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let result;
  try {
    result = await getStorage().deleteCategory(id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
  if (!result.deleted) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    uncategorizedCount: result.unlinkedSourceTitles.length,
    uncategorizedSources: result.unlinkedSourceTitles,
  });
}
