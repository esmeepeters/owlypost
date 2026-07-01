"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Source } from "@/lib/types";

const STATUS_STYLES: Record<Source["status"], string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  paused: "bg-neutral-100 text-neutral-600 border-neutral-200",
  error: "bg-red-50 text-red-700 border-red-200",
};

export function SourceRow({ source }: { source: Source }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(status: "active" | "paused") {
    setBusy(true);
    await fetch(`/api/sources/${source.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete "${source.title}" and all of its collected items?`,
      )
    ) {
      return;
    }
    setBusy(true);
    await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {source.site_url ? (
            <a
              href={source.site_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-accent"
            >
              {source.title}
            </a>
          ) : (
            source.title
          )}
        </p>
        <p className="truncate text-xs text-neutral-400">{source.feed_url}</p>
        {source.status === "error" && source.last_error && (
          <p className="mt-1 text-xs text-red-600">{source.last_error}</p>
        )}
      </div>
      <span
        className={`rounded border px-1.5 py-0.5 text-xs ${STATUS_STYLES[source.status]}`}
      >
        {source.status}
      </span>
      <div className="flex gap-2 text-xs">
        {source.status === "active" ? (
          <button
            onClick={() => setStatus("paused")}
            disabled={busy}
            className="text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
          >
            Pause
          </button>
        ) : (
          <button
            onClick={() => setStatus("active")}
            disabled={busy}
            className="text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
          >
            Resume
          </button>
        )}
        <button
          onClick={remove}
          disabled={busy}
          className="text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
