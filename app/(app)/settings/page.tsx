import { getStorage } from "@/lib/storage";
import { ProfileEditor } from "@/components/profile-editor";
import { TriggerButton } from "@/components/trigger-button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getStorage().getProfile();

  const emailConfigured = Boolean(
    process.env.RESEND_API_KEY &&
      process.env.DIGEST_EMAIL_FROM &&
      process.env.DIGEST_EMAIL_TO,
  );

  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Digest
        </h2>
        <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-neutral-500">Language</dt>
          <dd>{process.env.DIGEST_LANGUAGE || "nl"}</dd>
          <dt className="text-neutral-500">Timezone</dt>
          <dd>{process.env.DIGEST_TIMEZONE || "Europe/Amsterdam"}</dd>
          <dt className="text-neutral-500">Email delivery</dt>
          <dd>
            {emailConfigured
              ? `configured (to ${process.env.DIGEST_EMAIL_TO})`
              : "not configured — digests are available in the app only"}
          </dd>
        </dl>
        <p className="mt-2 text-xs text-neutral-400">
          Language, timezone and email are environment variables; change them
          in your <code>.env</code> and restart.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Schedule
        </h2>
        <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-neutral-500">Ingestion</dt>
          <dd>
            <code className="text-xs">
              {process.env.INGEST_CRON || "0 */6 * * *"}
            </code>
          </dd>
          <dt className="text-neutral-500">Weekly digest</dt>
          <dd>
            <code className="text-xs">
              {process.env.DIGEST_CRON || "0 17 * * 0"}
            </code>
          </dd>
        </dl>
        <p className="mt-2 text-xs text-neutral-400">
          The worker runs these cron schedules in {process.env.DIGEST_TIMEZONE ||
            "Europe/Amsterdam"}
          ; set <code>INGEST_CRON</code> / <code>DIGEST_CRON</code> in your{" "}
          <code>.env</code> and restart to change them.
        </p>
        <div className="mt-3 flex gap-3">
          <TriggerButton
            endpoint="/api/ingest"
            label="Fetch now"
            busyLabel="Starting…"
          />
          <TriggerButton
            endpoint="/api/digest"
            label="Generate digest now"
            busyLabel="Starting…"
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Preference profile
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Rewritten automatically from your ratings before every digest; your
          edits here are kept as the base for the next rewrite.
          {profile?.updated_at && (
            <span className="text-neutral-400">
              {" "}
              Last synthesis:{" "}
              {new Date(profile.updated_at).toLocaleString("en-GB")}.
            </span>
          )}
        </p>
        <div className="mt-3">
          <ProfileEditor initialProfile={profile?.profile_md ?? ""} />
        </div>
      </section>
    </>
  );
}
