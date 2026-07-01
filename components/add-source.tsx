"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/types";
import type { DetectedFeed } from "@/lib/feed-detect";

type DetectResponse =
  | { ok: true; feed: DetectedFeed }
  | { ok: false; tried: string[]; message: string };

const NEW_CATEGORY = "__new__";

export function AddSource({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState<string[]>([]);
  const [preview, setPreview] = useState<DetectedFeed | null>(null);
  const [categoryChoice, setCategoryChoice] = useState(
    categories[0]?.id ?? NEW_CATEGORY,
  );
  const [newCategory, setNewCategory] = useState("");

  async function detect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setTried([]);
    setPreview(null);
    try {
      const response = await fetch("/api/feeds/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = (await response.json()) as DetectResponse;
      if (result.ok) {
        setPreview(result.feed);
      } else {
        setError(result.message);
        setTried(result.tried);
      }
    } catch {
      setError("Feed detection failed unexpectedly. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: preview.title,
          feedUrl: preview.feedUrl,
          siteUrl: preview.siteUrl,
          ...(categoryChoice === NEW_CATEGORY
            ? { newCategoryName: newCategory }
            : { categoryId: categoryChoice }),
        }),
      });
      if (response.ok) {
        setUrl("");
        setPreview(null);
        setNewCategory("");
        router.refresh();
      } else {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "Saving the source failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded border border-neutral-200 p-4">
      <form onSubmit={detect} className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste any URL — newsletter, blog, news site, YouTube channel"
          required
          className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy && !preview ? "Detecting…" : "Detect feed"}
        </button>
      </form>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{error}</p>
          {tried.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer">What was tried</summary>
              <ul className="mt-1 list-inside list-disc">
                {tried.map((t) => (
                  <li key={t} className="break-all">
                    {t}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {preview && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <p className="font-medium">{preview.title}</p>
          <p className="break-all text-sm text-neutral-500">
            {preview.feedUrl}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-neutral-700">
            {preview.recentItems.map((item, index) => (
              <li key={index} className="truncate">
                · {item.title}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor="category" className="text-sm font-medium">
              Category
            </label>
            <select
              id="category"
              value={categoryChoice}
              onChange={(event) => setCategoryChoice(event.target.value)}
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>New category…</option>
            </select>
            {categoryChoice === NEW_CATEGORY && (
              <input
                type="text"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="Category name"
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
            )}
            <button
              type="button"
              onClick={confirm}
              disabled={
                busy || (categoryChoice === NEW_CATEGORY && !newCategory.trim())
              }
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Add source
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
