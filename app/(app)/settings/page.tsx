import { DEFAULT_DIGEST_SCHEDULE } from "@/lib/digest-schedule";
import { emailDeliveryStatus } from "@/lib/email";
import { formatShortDateTime } from "@/lib/format";
import { getStorage } from "@/lib/storage";
import { DigestScheduleEditor } from "@/components/digest-schedule-editor";
import { ProfileEditor } from "@/components/profile-editor";
import { TriggerButton } from "@/components/trigger-button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const storage = getStorage();
  const [profile, schedule] = await Promise.all([
    storage.getProfile(),
    storage.getDigestSchedule(),
  ]);
  const digestSchedule = schedule ?? DEFAULT_DIGEST_SCHEDULE;

  const email = emailDeliveryStatus();

  return (
    <>
      <h1 className="font-display text-2xl font-medium">Settings</h1>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Digest
        </h2>
        <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-neutral-500">Language</dt>
          <dd>{process.env.DIGEST_LANGUAGE || "en"}</dd>
          <dt className="text-neutral-500">Timezone</dt>
          <dd>{process.env.DIGEST_TIMEZONE || "UTC"}</dd>
          <dt className="text-neutral-500">Email delivery</dt>
          <dd>
            {email.configured
              ? `configured (${email.provider} to ${email.to})`
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
        </dl>
        <p className="mt-2 text-xs text-neutral-400">
          Ingestion runs on <code>INGEST_CRON</code>; set it in your{" "}
          <code>.env</code> and restart to change it.
        </p>
        <h3 className="mt-4 text-sm font-medium">Digest delivery</h3>
        <div className="mt-2">
          <DigestScheduleEditor
            initialSchedule={{
              frequency: digestSchedule.frequency,
              dayOfWeek: digestSchedule.day_of_week,
              hour: digestSchedule.hour,
              minute: digestSchedule.minute,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          Times are in {process.env.DIGEST_TIMEZONE || "UTC"}; changes take
          effect within a minute, no restart needed.
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
              {formatShortDateTime(
                new Date(profile.updated_at),
                process.env.DIGEST_LANGUAGE || "en",
              )}
              .
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
