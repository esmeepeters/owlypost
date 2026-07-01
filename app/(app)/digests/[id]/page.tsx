import { notFound } from "next/navigation";
import { getStorage } from "@/lib/storage";
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

  const digestItems = await storage.getDigestItems(id);
  const byItemId = new Map(digestItems.map((row) => [row.item_id, row]));

  const sections =
    ((typedDigest.body as { sections?: Section[] } | null)?.sections ??
      []) as Section[];

  return (
    <>
      <h1 className="text-2xl font-semibold">
        Week of {typedDigest.week_start} – {typedDigest.week_end}
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
          {typedDigest.intro_md && (
            <div className="mt-6 text-[15px] text-neutral-800">
              <Markdown text={typedDigest.intro_md} />
            </div>
          )}

          {sections.map((section) => (
            <section key={section.category} className="mt-10">
              <h2 className="text-lg font-semibold">{section.category}</h2>
              {section.narrative_md && (
                <div className="mt-2 text-sm text-neutral-600">
                  <Markdown text={section.narrative_md} />
                </div>
              )}
              <ul className="mt-4 space-y-4">
                {section.items.map((entry) => {
                  const row = byItemId.get(entry.item_id);
                  if (!row?.item) return null;
                  const item = row.item;
                  return (
                    <li
                      key={row.id}
                      id={`item-${row.id}`}
                      className="scroll-mt-20 rounded border border-neutral-200 p-4"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${VERDICT_STYLES[entry.verdict]}`}
                        >
                          {VERDICT_LABELS[entry.verdict]}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">
                            {item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-accent"
                              >
                                {item.title}
                              </a>
                            ) : (
                              item.title
                            )}
                          </p>
                          <p className="mt-1 text-sm text-neutral-600">
                            {entry.reason}
                          </p>
                          <Rating
                            digestItemId={row.id}
                            initialRating={row.feedback?.rating ?? null}
                            initialComment={row.feedback?.comment ?? null}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {typedDigest.closing_md && (
            <div className="mt-10 border-t border-neutral-100 pt-6 text-sm text-neutral-600">
              <Markdown text={typedDigest.closing_md} />
            </div>
          )}
        </>
      )}
    </>
  );
}
