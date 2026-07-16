import { formatDistanceToNow } from "date-fns";
import { getStorage } from "@/lib/storage";
import { InboxFilters } from "@/components/inbox-filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; source?: string }>;
}) {
  const { category, source } = await searchParams;
  const storage = getStorage();

  const [itemList, categories, sources] = await Promise.all([
    storage.listInboxItems({ source, category, limit: PAGE_SIZE }),
    storage.listCategories(),
    storage.listAllSources(),
  ]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium">Inbox</h1>
        <InboxFilters
          categories={categories}
          sources={sources}
          selectedCategory={category}
          selectedSource={source}
        />
      </div>

      {itemList.length === 0 && (
        <p className="mt-8 text-neutral-600">
          Nothing collected yet. Add sources and press &ldquo;Fetch now&rdquo;
          on the sources page, or wait for the next scheduled run.
        </p>
      )}

      <ul className="mt-6 divide-y divide-neutral-100">
        {itemList.map((item) => {
          const time = item.published_at ?? item.fetched_at;
          return (
            <li key={item.id} className="py-4">
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
              <p className="mt-0.5 text-xs text-neutral-400">
                {item.sources.title} ·{" "}
                {formatDistanceToNow(new Date(time), { addSuffix: true })}
              </p>
              {item.summary && (
                <p className="mt-1.5 text-sm text-neutral-700">
                  {item.summary}
                </p>
              )}
              {item.topics && item.topics.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.topics.map((topic) => (
                    <span
                      key={topic}
                      className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600"
                    >
                      {topic}
                    </span>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
