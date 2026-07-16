import Link from "next/link";
import { getStorage } from "@/lib/storage";
import { weekWindow } from "@/lib/digest";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const storage = getStorage();
  const timeZone = process.env.DIGEST_TIMEZONE || "UTC";
  const { startUtc } = weekWindow(new Date(), timeZone);

  const [itemCount, digest, broken] = await Promise.all([
    storage.countItemsSince(startUtc.toISOString()),
    storage.getLatestDigest(),
    storage.listErrorSources(),
  ]);

  return (
    <>
      <h1 className="font-display text-2xl font-medium">Dashboard</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-neutral-200 p-4">
          <p className="text-3xl font-semibold text-accent">{itemCount}</p>
          <p className="mt-1 text-sm text-neutral-600">
            items collected this week
          </p>
        </div>
        <div className="rounded border border-neutral-200 p-4">
          {digest ? (
            <>
              <p className="font-medium">
                <Link
                  href={`/digests/${digest.id}`}
                  className="hover:text-accent"
                >
                  Latest digest: {digest.week_start} – {digest.week_end}
                </Link>
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                status: {digest.status}
              </p>
            </>
          ) : (
            <p className="text-sm text-neutral-600">
              No digest yet. The first one arrives Sunday evening, or trigger
              one from the <Link href="/digests" className="text-accent">digests page</Link>.
            </p>
          )}
        </div>
      </div>

      {broken.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-red-600">
            Sources in error
          </h2>
          <ul className="mt-2 space-y-2">
            {broken.map((source) => (
              <li
                key={source.id}
                className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm"
              >
                <span className="font-medium">{source.title}</span>
                {source.last_error && (
                  <span className="text-red-700"> — {source.last_error}</span>
                )}
                <Link href="/sources" className="ml-2 text-accent">
                  manage
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
