import { getStorage } from "@/lib/storage";
import { AddCategory } from "@/components/add-category";
import { AddSource } from "@/components/add-source";
import { CategoryRow } from "@/components/category-row";
import { SourceRow } from "@/components/source-row";
import { TriggerButton } from "@/components/trigger-button";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const storage = getStorage();
  const [categoryList, sourceList] = await Promise.all([
    storage.listCategoriesWithSourceCounts(),
    storage.listAllSources(),
  ]);

  const groups = categoryList
    .map((category) => ({
      category,
      sources: sourceList.filter((s) => s.category_id === category.id),
    }))
    .filter((group) => group.sources.length > 0);
  const uncategorized = sourceList.filter((s) => s.category_id === null);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium">Sources</h1>
        <TriggerButton
          endpoint="/api/ingest"
          label="Fetch now"
          busyLabel="Starting…"
        />
      </div>

      <AddSource categories={categoryList} />

      <details className="mt-6 rounded border border-neutral-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Manage categories ({categoryList.length})
        </summary>
        <AddCategory />
        {categoryList.length > 0 && (
          <ul className="mt-3 divide-y divide-neutral-100">
            {categoryList.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </ul>
        )}
      </details>

      {sourceList.length === 0 && (
        <p className="mt-8 text-neutral-600">
          No sources yet. Paste a URL above — a Substack, news site, blog or
          YouTube channel — and Owly Post finds its feed.
        </p>
      )}

      {groups.map(({ category, sources }) => (
        <section key={category.id} className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {category.name}
          </h2>
          <ul className="mt-2 divide-y divide-neutral-100">
            {sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                categories={categoryList}
              />
            ))}
          </ul>
        </section>
      ))}

      {uncategorized.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Uncategorized
          </h2>
          <ul className="mt-2 divide-y divide-neutral-100">
            {uncategorized.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                categories={categoryList}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
