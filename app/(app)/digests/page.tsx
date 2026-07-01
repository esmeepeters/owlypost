import Link from "next/link";
import { getStorage } from "@/lib/storage";
import type { Digest } from "@/lib/types";
import { TriggerButton } from "@/components/trigger-button";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<Digest["status"], string> = {
  draft: "bg-neutral-100 text-neutral-600 border-neutral-200",
  ready: "bg-green-50 text-green-700 border-green-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

export default async function DigestsPage() {
  const digestList = await getStorage().listDigests();

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Digests</h1>
        <TriggerButton
          endpoint="/api/digest"
          label="Generate digest now"
          busyLabel="Starting…"
        />
      </div>

      {digestList.length === 0 && (
        <p className="mt-8 text-neutral-600">
          No digests yet. One is generated every Sunday evening, or press
          &ldquo;Generate digest now&rdquo;.
        </p>
      )}

      <ul className="mt-6 divide-y divide-neutral-100">
        {digestList.map((digest) => (
          <li key={digest.id} className="flex items-center gap-3 py-3">
            <Link
              href={`/digests/${digest.id}`}
              className="flex-1 font-medium hover:text-accent"
            >
              Week of {digest.week_start} – {digest.week_end}
            </Link>
            <span className="text-xs text-neutral-400">
              {new Date(digest.created_at).toLocaleDateString("en-GB")}
            </span>
            <span
              className={`rounded border px-1.5 py-0.5 text-xs ${STATUS_STYLES[digest.status]}`}
            >
              {digest.status}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
