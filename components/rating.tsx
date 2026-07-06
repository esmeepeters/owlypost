"use client";

import { useState } from "react";
import type { Rating as RatingValue } from "@/lib/types";

// What the feedback is about: an item's verdict or a section's summary.
export type RatingTarget =
  | { kind: "item"; digestItemId: string }
  | { kind: "section"; digestId: string; category: string };

// Thumbs up saves immediately; thumbs down reveals a textarea asking why and
// saves on confirm. Ratings stay editable afterwards.
export function Rating({
  target,
  initialRating,
  initialComment,
  placeholder = "Why was this verdict off?",
}: {
  target: RatingTarget;
  initialRating: RatingValue | null;
  initialComment: string | null;
  placeholder?: string;
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
    const payload =
      target.kind === "item"
        ? { digestItemId: target.digestItemId }
        : { digestId: target.digestId, category: target.category };
    const response = await fetch("/api/feedback", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
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
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => save("up", null)}
          disabled={busy}
          aria-label="Thumbs up"
          className={`rounded px-1.5 py-0.5 text-xs ${
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
          className={`rounded px-1.5 py-0.5 text-xs ${
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
            placeholder={placeholder}
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
