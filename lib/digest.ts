import { format, startOfWeek } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { z } from "zod";
import { getLlm, JsonCallError } from "./llm/index.ts";
import { isEmailConfigured, sendDigestEmail } from "./email/index.ts";
import { synthesizeProfile } from "./profile.ts";
import type { Storage } from "./storage/index.ts";
import type { DigestCandidate as DigestItemInput } from "./storage/types.ts";

const ITEM_CAP = 300;
// Undigested items older than this never enter a digest, so a newly added
// source with years of archives cannot flood the first digest after it.
const MAX_ITEM_AGE_DAYS = 30;
const ITEM_RECORD_MAX_CHARS = 1500;
const FEEDBACK_IN_PROMPT = 30;
// Verdict JSON for a busy week (up to ITEM_CAP items, each with a uuid and a
// reason sentence) plus the per-category narratives needs generous headroom.
const DIGEST_MAX_TOKENS = 24576;

export type DigestRunResult = {
  digestId: string | null;
  status: "ready" | "failed" | "quiet";
};

export function weekWindow(now: Date, timeZone: string) {
  const zonedNow = toZonedTime(now, timeZone);
  const zonedStart = startOfWeek(zonedNow, { weekStartsOn: 1 });
  return {
    startUtc: fromZonedTime(zonedStart, timeZone),
    weekStart: format(zonedStart, "yyyy-MM-dd"),
    weekEnd: format(zonedNow, "yyyy-MM-dd"),
  };
}

// The range digest candidates must fall in: everything up to now, at most
// maxAgeDays old. The upper bound keeps future-dated published_at out.
export function eligibilityRange(now: Date, maxAgeDays = MAX_ITEM_AGE_DAYS) {
  return {
    sinceUtc: new Date(
      now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000,
    ).toISOString(),
    untilUtc: now.toISOString(),
  };
}

// When over the cap, keep the most recent items per source proportionally so
// no single source crowds out the rest.
export function capItemsProportionally<
  T extends { source_id: string; published_at: string | null; fetched_at: string },
>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;

  const time = (item: T) => item.published_at ?? item.fetched_at;
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.source_id) ?? [];
    group.push(item);
    groups.set(item.source_id, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => time(b).localeCompare(time(a)));
  }

  const total = items.length;
  const quotas = new Map<string, { base: number; fraction: number }>();
  let allocated = 0;
  for (const [sourceId, group] of groups) {
    const exact = (cap * group.length) / total;
    const base = Math.min(Math.floor(exact), group.length);
    quotas.set(sourceId, { base, fraction: exact - base });
    allocated += base;
  }

  // Distribute the remainder by largest fractional part.
  const bySpare = [...groups.keys()]
    .filter((id) => quotas.get(id)!.base < groups.get(id)!.length)
    .sort((a, b) => quotas.get(b)!.fraction - quotas.get(a)!.fraction);
  let leftover = cap - allocated;
  for (const sourceId of bySpare) {
    if (leftover <= 0) break;
    quotas.get(sourceId)!.base += 1;
    leftover -= 1;
  }

  const result: T[] = [];
  for (const [sourceId, group] of groups) {
    result.push(...group.slice(0, quotas.get(sourceId)!.base));
  }
  result.sort((a, b) => time(b).localeCompare(time(a)));
  return result;
}

const digestSchema = z.object({
  intro_md: z.string().min(1),
  sections: z.array(
    z.object({
      category: z.string(),
      narrative_md: z.string(),
      items: z.array(
        z.object({
          item_id: z.string(),
          verdict: z.enum(["must_read", "worth_it", "skip"]),
          reason: z.string(),
        }),
      ),
    }),
  ),
  closing_md: z.string(),
});

export type DigestBody = z.infer<typeof digestSchema>;

// Enforces that every provided item id appears exactly once: duplicates keep
// their first occurrence, unknown ids are dropped, and missing items are
// appended with verdict skip.
export function fixupSections(
  body: DigestBody,
  items: { id: string; categoryName: string }[],
): DigestBody {
  const validIds = new Set(items.map((item) => item.id));
  const seen = new Set<string>();

  const sections = body.sections.map((section) => ({
    ...section,
    items: section.items.filter((entry) => {
      if (!validIds.has(entry.item_id) || seen.has(entry.item_id)) {
        return false;
      }
      seen.add(entry.item_id);
      return true;
    }),
  }));

  const missing = items.filter((item) => !seen.has(item.id));
  for (const item of missing) {
    let section = sections.find((s) => s.category === item.categoryName);
    if (!section) {
      section = { category: item.categoryName, narrative_md: "", items: [] };
      sections.push(section);
    }
    section.items.push({
      item_id: item.id,
      verdict: "skip",
      reason: "not selected by the model",
    });
  }

  return {
    ...body,
    sections: sections.filter((section) => section.items.length > 0),
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function buildPrompt(options: {
  language: string;
  weekStart: string;
  weekEnd: string;
  categoryNames: string[];
  profileMd: string;
  feedback: { rating: string; title: string; comment: string | null }[];
  itemsByCategory: Map<string, DigestItemInput[]>;
}): { system: string; prompt: string } {
  const {
    language,
    weekStart,
    weekEnd,
    categoryNames,
    profileMd,
    feedback,
    itemsByCategory,
  } = options;

  const system = [
    `You are the editor of a personal weekly reading digest: sharp, opinionated, allergic to hype, and focused on saving your reader time.`,
    `You write in the language with code "${language}".`,
    `You know the reader well; their preference profile and recent feedback are provided.`,
    `Verdicts: "must_read" is rare and precious, "worth_it" is solid, "skip" is honest. Be decisive.`,
  ].join(" ");

  const lines: string[] = [];
  lines.push(`Week: ${weekStart} to ${weekEnd}`);
  lines.push("");
  lines.push(`Categories: ${categoryNames.join(", ") || "(none)"}`);
  lines.push("");
  lines.push("Reader preference profile:");
  lines.push(profileMd.trim() || "(no profile yet)");
  lines.push("");
  lines.push("Recent feedback on earlier verdicts (rating, item, comment):");
  if (feedback.length === 0) {
    lines.push("(none yet)");
  } else {
    for (const entry of feedback) {
      lines.push(
        `- ${entry.rating === "up" ? "👍" : "👎"} "${entry.title}"${entry.comment ? ` — ${entry.comment}` : ""}`,
      );
    }
  }
  lines.push("");
  lines.push("New items since the last digest, grouped by category:");
  for (const [category, items] of itemsByCategory) {
    lines.push("");
    lines.push(`## ${category}`);
    for (const item of items) {
      const record = JSON.stringify({
        item_id: item.id,
        source: item.sources.title,
        title: item.title,
        url: item.url,
        summary: item.summary,
        topics: item.topics,
      });
      lines.push(truncate(record, ITEM_RECORD_MAX_CHARS));
    }
  }
  lines.push("");
  lines.push(
    [
      "Write the weekly digest as JSON matching exactly this shape:",
      `{`,
      `  "intro_md": "editorial summary of the week across all sources, at most 300 words, in ${language} — scale it down when the week has few items; never pad",`,
      `  "sections": [`,
      `    {`,
      `      "category": "category name",`,
      `      "narrative_md": "a complete markdown summary of this category, at most 250 words and proportional to the number and substance of the items (a category with one or two items needs only a short paragraph), covering everything the reader needs to know from this week's items so they are up to date without reading them",`,
      `      "items": [`,
      `        { "item_id": "uuid", "verdict": "must_read | worth_it | skip", "reason": "one sentence" }`,
      `      ]`,
      `    }`,
      `  ],`,
      `  "closing_md": "one short paragraph"`,
      `}`,
      "",
      "Every item_id from the list above must appear exactly once across all sections.",
      "Use the category names as given. All prose in the digest language.",
      "Match length to substance: with few items, keep the digest short rather than padding it.",
    ].join("\n"),
  );

  return { system, prompt: lines.join("\n") };
}

function quietWeekIntro(language: string): string {
  return language === "nl"
    ? "Deze week niets te melden: je bronnen hebben geen nieuwe items gepubliceerd. De volgende digest pikt de draad weer op."
    : "Nothing to show this week: your sources published no new items. The next digest will cover whatever comes in.";
}

export async function runDigest(storage: Storage): Promise<DigestRunResult> {
  const timeZone = process.env.DIGEST_TIMEZONE || "UTC";
  const language = process.env.DIGEST_LANGUAGE || "en";
  const now = new Date();
  const { weekStart, weekEnd } = weekWindow(now, timeZone);

  // 1. Collect everything not yet included in a digest (by published_at,
  // falling back to fetched_at), capped in age. Membership in digest_items is
  // only recorded on a successful run, so a failed run leaves its items
  // eligible for the next one, and a re-run after success finds nothing.
  const allItems = await storage.getUndigestedItems(eligibilityRange(now));

  // 2. Quiet week: store a short digest, email it, and stop.
  if (allItems.length === 0) {
    const intro = quietWeekIntro(language);
    const { id: digestId } = await storage.insertDigest({
      week_start: weekStart,
      week_end: weekEnd,
      status: "ready",
      intro_md: intro,
      body: { sections: [] },
    });

    if (isEmailConfigured()) {
      try {
        const sent = await sendDigestEmail({
          digestId,
          weekStart,
          weekEnd,
          quietMessage: intro,
          sections: [],
        });
        if (sent) {
          await storage.updateDigestStatus(digestId, "sent");
        }
      } catch (error) {
        console.error("Digest email failed:", error);
      }
    }

    return { digestId, status: "quiet" };
  }

  const items = capItemsProportionally(allItems, ITEM_CAP);

  // 3. Refresh the preference profile from accumulated feedback.
  await synthesizeProfile(storage);

  // 4. Gather prompt context.
  const [categories, profileRow, feedbackRows] = await Promise.all([
    storage.listCategories(),
    storage.getProfile(),
    storage.listRecentFeedback(FEEDBACK_IN_PROMPT),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const nameOf = (item: DigestItemInput) =>
    (item.sources.category_id && categoryName.get(item.sources.category_id)) ||
    "Uncategorized";

  const itemsByCategory = new Map<string, DigestItemInput[]>();
  for (const item of items) {
    const name = nameOf(item);
    const group = itemsByCategory.get(name) ?? [];
    group.push(item);
    itemsByCategory.set(name, group);
  }

  const feedback = feedbackRows.map((row) => ({
    rating: row.rating as string,
    title: row.title ?? "(deleted item)",
    comment: row.comment,
  }));

  const { system, prompt } = buildPrompt({
    language,
    weekStart,
    weekEnd,
    categoryNames: [...itemsByCategory.keys()],
    profileMd: profileRow?.profile_md ?? "",
    feedback,
    itemsByCategory,
  });

  // 5. Call the model; on a double JSON failure store the raw response with
  // status failed so it surfaces on the digests page.
  const llm = getLlm();
  const model = llm.digestModel;
  let body: DigestBody;
  let usage;
  try {
    const result = await llm.callJson({
      model,
      system,
      prompt,
      maxTokens: DIGEST_MAX_TOKENS,
      schema: digestSchema,
    });
    body = result.data;
    usage = result.usage;
  } catch (error) {
    // Any model-call failure (a JSON error after retry, or a transport error
    // such as a timeout/overload) is stored as a failed digest so it surfaces
    // on the digests page instead of failing the run silently.
    const isJsonError = error instanceof JsonCallError;
    const { id } = await storage.insertDigest({
      week_start: weekStart,
      week_end: weekEnd,
      status: "failed",
      model,
      token_usage: isJsonError ? error.usage : null,
      raw_response: isJsonError
        ? error.rawResponse
        : error instanceof Error
          ? error.message
          : String(error),
    });
    return { digestId: id, status: "failed" };
  }

  const fixed = fixupSections(
    body,
    items.map((item) => ({ id: item.id, categoryName: nameOf(item) })),
  );

  // 6. Store the digest and its per-item verdicts in document order.
  const { id: digestId } = await storage.insertDigest({
    week_start: weekStart,
    week_end: weekEnd,
    status: "ready",
    intro_md: fixed.intro_md,
    closing_md: fixed.closing_md,
    body: { sections: fixed.sections },
    model,
    token_usage: usage,
  });

  let rank = 0;
  const digestItems = fixed.sections.flatMap((section) =>
    section.items.map((entry) => ({
      digest_id: digestId,
      item_id: entry.item_id,
      verdict: entry.verdict,
      reason: entry.reason,
      rank: rank++,
    })),
  );
  const insertedDigestItems = await storage.insertDigestItems(digestItems);

  // 7. Email, only when a delivery provider is configured; a delivery failure
  // never fails the run — the digest simply stays at status ready.
  if (isEmailConfigured()) {
    try {
      const itemById = new Map(items.map((item) => [item.id, item]));
      const digestItemId = new Map(
        insertedDigestItems.map((row) => [row.item_id, row.id]),
      );
      const sent = await sendDigestEmail({
        digestId,
        weekStart,
        weekEnd,
        sections: fixed.sections.map((section) => ({
          category: section.category,
          narrativeMd: section.narrative_md,
          items: section.items.flatMap((entry) => {
            const item = itemById.get(entry.item_id);
            const id = digestItemId.get(entry.item_id);
            if (!item || !id) return [];
            return [
              {
                digestItemId: id,
                title: item.title,
                url: item.url,
                sourceTitle: item.sources.title,
                verdict: entry.verdict,
                reason: entry.reason,
              },
            ];
          }),
        })),
      });
      if (sent) {
        await storage.updateDigestStatus(digestId, "sent");
      }
    } catch (error) {
      console.error("Digest email failed:", error);
    }
  }

  return { digestId, status: "ready" };
}
