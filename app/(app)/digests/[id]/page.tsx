import { notFound } from "next/navigation";
import { formatWeekRange } from "@/lib/format";
import { getStorage } from "@/lib/storage";
import { sectionSlug } from "@/lib/slug";
import type { Verdict } from "@/lib/types";
import { Markdown } from "@/components/markdown";
import { Rating } from "@/components/rating";

export const dynamic = "force-dynamic";

const VERDICT_STYLES: Record<Verdict, string> = {
  must_read: "bg-accent text-white",
  worth_it: "bg-green-100 text-green-800",
  skip: "bg-neutral-100 text-neutral-500",
};

const VERDICT_LABELS: Record<Verdict, string> = {
  must_read: "must read",
  worth_it: "worth it",
  skip: "skip",
};

type Section = {
  category: string;
  narrative_md: string;
  items: { item_id: string; verdict: Verdict; reason: string }[];
};

export default async function DigestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const storage = getStorage();

  const typedDigest = await storage.getDigest(id);
  if (!typedDigest) notFound();

  const [digestItems, sectionFeedback] = await Promise.all([
    storage.getDigestItems(id),
    storage.listSectionFeedbackForDigest(id),
  ]);
  const byItemId = new Map(digestItems.map((row) => [row.item_id, row]));
  const feedbackByCategory = new Map(
    sectionFeedback.map((row) => [row.category, row]),
  );

  const sections =
    ((typedDigest.body as { sections?: Section[] } | null)?.sections ??
      []) as Section[];

  return (
    <>
      <h1 className="text-2xl font-semibold">
        {formatWeekRange(
          typedDigest.week_start,
          typedDigest.week_end,
          process.env.DIGEST_LANGUAGE || "en",
        )}
      </h1>

      {typedDigest.status === "failed" ? (
        <div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">
            This digest failed to generate: the model did not return valid
            JSON, even after a retry.
          </p>
          {typedDigest.raw_response && (
            <details className="mt-2">
              <summary className="cursor-pointer">Raw model response</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
                {typedDigest.raw_response}
              </pre>
            </details>
          )}
        </div>
      ) : (
        <>
          {sections.length === 0 && typedDigest.intro_md && (
            <div className="mt-6 text-[15px] text-neutral-800">
              <Markdown text={typedDigest.intro_md} />
            </div>
          )}

          {sections.map((section) => {
            const visible = section.items.filter(
              (entry) => entry.verdict !== "skip",
            );
            const feedback = feedbackByCategory.get(section.category);
            return (
              <section
                key={section.category}
                id={`section-${sectionSlug(section.category)}`}
                className="mt-10 scroll-mt-20"
              >
                <h2 className="text-lg font-semibold">{section.category}</h2>
                {section.narrative_md && (
                  <div className="mt-2 text-[15px] text-neutral-800">
                    <Markdown text={section.narrative_md} />
                  </div>
                )}
                <Rating
                  target={{
                    kind: "section",
                    digestId: id,
                    category: section.category,
                  }}
                  initialRating={feedback?.rating ?? null}
                  initialComment={feedback?.comment ?? null}
                  placeholder="What was off about this summary?"
                />
                {visible.length > 0 && (
                  <ul className="mt-4 space-y-2.5">
                    {visible.map((entry) => {
                      const row = byItemId.get(entry.item_id);
                      if (!row?.item) return null;
                      const item = row.item;
                      return (
                        <li
                          key={row.id}
                          id={`item-${row.id}`}
                          className="scroll-mt-20"
                        >
                          <p className="leading-snug">
                            <span
                              className={`mr-1.5 inline-block rounded px-1.5 py-0.5 align-[1px] text-[11px] font-medium ${VERDICT_STYLES[entry.verdict]}`}
                            >
                              {VERDICT_LABELS[entry.verdict]}
                            </span>
                            {item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium hover:text-accent"
                              >
                                {item.title}
                              </a>
                            ) : (
                              <span className="font-medium">{item.title}</span>
                            )}
                            {row.source_title && (
                              <span className="ml-1.5 text-xs text-neutral-400">
                                · {row.source_title}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-neutral-600">
                            {entry.reason}
                          </p>
                          <Rating
                            target={{ kind: "item", digestItemId: row.id }}
                            initialRating={row.feedback?.rating ?? null}
                            initialComment={row.feedback?.comment ?? null}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
