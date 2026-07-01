"use client";

import { useRouter } from "next/navigation";
import type { Category, Source } from "@/lib/types";

export function InboxFilters({
  categories,
  sources,
  selectedCategory,
  selectedSource,
}: {
  categories: Category[];
  sources: Source[];
  selectedCategory?: string;
  selectedSource?: string;
}) {
  const router = useRouter();

  function navigate(category: string, source: string) {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (source) params.set("source", source);
    const qs = params.toString();
    router.push(qs ? `/inbox?${qs}` : "/inbox");
  }

  return (
    <div className="flex gap-2">
      <select
        value={selectedCategory ?? ""}
        onChange={(event) => navigate(event.target.value, selectedSource ?? "")}
        className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <select
        value={selectedSource ?? ""}
        onChange={(event) =>
          navigate(selectedCategory ?? "", event.target.value)
        }
        className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
      >
        <option value="">All sources</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.title}
          </option>
        ))}
      </select>
    </div>
  );
}
