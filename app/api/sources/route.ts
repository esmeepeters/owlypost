import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";
import { isUniqueViolation } from "@/lib/storage/postgres";

const bodySchema = z
  .object({
    title: z.string().min(1),
    feedUrl: z.url(),
    siteUrl: z.url().nullable(),
    categoryId: z.uuid().optional(),
    newCategoryName: z.string().min(1).optional(),
  })
  .refine((body) => body.categoryId || body.newCategoryName, {
    message: "Pick an existing category or name a new one.",
  });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const storage = getStorage();

  let categoryId = body.categoryId ?? null;
  if (!categoryId && body.newCategoryName) {
    const name = body.newCategoryName.trim();
    const existing = await storage.findCategoryByName(name);
    if (existing) {
      categoryId = existing.id;
    } else {
      try {
        const created = await storage.insertCategory(name);
        categoryId = created.id;
      } catch (error) {
        return NextResponse.json(
          {
            error: `Could not create category: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
          { status: 500 },
        );
      }
    }
  }

  try {
    await storage.insertSource({
      title: body.title,
      feed_url: body.feedUrl,
      site_url: body.siteUrl,
      category_id: categoryId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "This feed is already in your sources." },
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
