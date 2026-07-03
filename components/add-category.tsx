"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddCategory() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        setName("");
        router.refresh();
      } else {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "Creating the category failed.");
      }
    } catch {
      setError("Creating the category failed unexpectedly. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <form onSubmit={create} className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New category name"
          required
          className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add category"}
        </button>
      </form>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
