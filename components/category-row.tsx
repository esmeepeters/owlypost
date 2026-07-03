"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryWithCount } from "@/lib/storage/types";

function feedCount(count: number) {
  if (count === 0) return "no feeds";
  if (count === 1) return "1 feed";
  return `${count} feeds`;
}

export function CategoryRow({ category }: { category: CategoryWithCount }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Category name is required.");
      return;
    }
    if (trimmed === category.name) {
      setEditing(false);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (response.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "Renaming the category failed.");
      }
    } catch {
      setError("Renaming the category failed unexpectedly. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setName(category.name);
    setError(null);
    setEditing(false);
  }

  async function remove() {
    const warning =
      category.source_count > 0
        ? `Delete "${category.name}"? ${feedCount(category.source_count)} will become uncategorized (the feeds themselves are kept).`
        : `Delete "${category.name}"?`;
    if (!window.confirm(warning)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        router.refresh();
      } else {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "Deleting the category failed.");
      }
    } catch {
      setError("Deleting the category failed unexpectedly. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        {editing ? (
          <form onSubmit={save} className="flex flex-1 gap-2">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{category.name}</p>
              <p className="text-xs text-neutral-400">
                {feedCount(category.source_count)}
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setEditing(true)}
                disabled={busy}
                className="text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
              >
                Rename
              </button>
              <button
                onClick={remove}
                disabled={busy}
                className="text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </li>
  );
}
