import { NextResponse } from "next/server";
import { z } from "zod";
import { detectFeed } from "@/lib/feed-detect";

const bodySchema = z.object({ url: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a url." }, { status: 400 });
  }

  const result = await detectFeed(parsed.data.url);
  return NextResponse.json(result);
}
