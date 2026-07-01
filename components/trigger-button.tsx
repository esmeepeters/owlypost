"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Button for the manual job triggers ("Fetch now", "Generate digest now").
export function TriggerButton({
  endpoint,
  label,
  busyLabel,
}: {
  endpoint: string;
  label: string;
  busyLabel: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function trigger() {
    setState("busy");
    setMessage(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      if (response.ok) {
        setState("done");
        setMessage("Started in the background; refresh in a bit.");
        router.refresh();
      } else {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setState("error");
        setMessage(body?.error ?? `Request failed (${response.status}).`);
      }
    } catch {
      setState("error");
      setMessage("Request failed.");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={trigger}
        disabled={state === "busy"}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {state === "busy" ? busyLabel : label}
      </button>
      {message && (
        <span
          className={`text-xs ${state === "error" ? "text-red-600" : "text-neutral-500"}`}
        >
          {message}
        </span>
      )}
    </span>
  );
}
