"use client";

import { useState } from "react";
import type { Rating as RatingValue } from "@/lib/types";

// Thumbs up saves immediately; thumbs down reveals a textarea asking why and
// saves on confirm. Ratings stay editable afterwards.
export function Rating({
  digestItemId,
  initialRating,
  initialComment,
}: {
  digestItemId: string;
  initialRating: RatingValue | null;
  initialComment: string | null;
}) {
  const [rating, setRating] = useState<RatingValue | null>(initialRating);
  const [comment, setComment] = useState(initialComment ?? "");
  const [draft, setDraft] = useState(initialComment ?? "");
  const [editingDown, setEditingDown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function save(nextRating: RatingValue, nextComment: string | null) {
    setBusy(true);
    setError(false);
    const response = await fetch("/api/feedback", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        digestItemId,
        rating: nextRating,
        comment: nextComment,
      }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      setRating(nextRating);
      setComment(nextComment ?? "");
      setEditingDown(false);
    } else {
      setError(true);
    }
  }

  return (
    <div className="mt-3 border-t border-neutral-100 pt-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => save("up", null)}
          disabled={busy}
          aria-label="Thumbs up"
          className={`rounded px-2 py-1 text-sm ${
            rating === "up"
              ? "bg-green-100"
              : "opacity-40 hover:opacity-100"
          } disabled:opacity-30`}
        >
          👍
        </button>
        <button
          onClick={() => {
            setDraft(comment);
            setEditingDown(true);
          }}
          disabled={busy}
          aria-label="Thumbs down"
          className={`rounded px-2 py-1 text-sm ${
            rating === "down"
              ? "bg-red-100"
              : "opacity-40 hover:opacity-100"
          } disabled:opacity-30`}
        >
          👎
        </button>
        {rating === "down" && comment && !editingDown && (
          <span className="truncate text-xs text-neutral-500">
            &ldquo;{comment}&rdquo;
          </span>
        )}
        {error && (
          <span className="text-xs text-red-600">Saving failed, try again.</span>
        )}
      </div>

      {editingDown && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Why was this verdict off?"
            rows={2}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => save("down", draft)}
              disabled={busy}
              className="rounded bg-accent px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setEditingDown(false)}
              disabled={busy}
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
