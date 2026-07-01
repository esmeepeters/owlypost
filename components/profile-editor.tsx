"use client";

import { useState } from "react";

export function ProfileEditor({ initialProfile }: { initialProfile: string }) {
  const [text, setText] = useState(initialProfile);
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">(
    "idle",
  );

  async function save() {
    setState("busy");
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileMd: text }),
    }).catch(() => null);
    setState(response?.ok ? "saved" : "error");
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setState("idle");
        }}
        rows={14}
        placeholder="No profile yet. It is written automatically from your ratings, and you can edit it here at any time."
        className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={state === "busy"}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {state === "busy" ? "Saving…" : "Save profile"}
        </button>
        {state === "saved" && (
          <span className="text-xs text-neutral-500">Saved.</span>
        )}
        {state === "error" && (
          <span className="text-xs text-red-600">Saving failed.</span>
        )}
      </div>
    </div>
  );
}
