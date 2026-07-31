"use client";

import { useState } from "react";

// Defense in depth: the id is interpolated into the embed URL, so only accept
// the plain YouTube id alphabet even though ingest already controls the value.
const YOUTUBE_ID = /^[\w-]{5,20}$/;

function formatDuration(total: number): string {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return `${hours > 0 ? `${hours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
}

// Click-to-play facade: nothing loads from YouTube or the podcast CDN until
// the thumbnail is clicked.
export function MediaPlayer({
  type,
  title,
  externalId,
  mediaUrl,
  mediaType,
  thumbnailUrl,
  durationSeconds,
}: {
  type: "youtube" | "podcast";
  title: string;
  externalId: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}) {
  const [playing, setPlaying] = useState(false);

  if (type === "youtube" && !(externalId && YOUTUBE_ID.test(externalId))) {
    return null;
  }
  if (type === "podcast" && !mediaUrl) return null;

  if (playing && type === "youtube") {
    return (
      <div className="aspect-video max-w-sm overflow-hidden rounded">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${externalId}?autoplay=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    );
  }

  if (playing && type === "podcast") {
    return (
      <audio controls autoPlay preload="none" className="w-full max-w-sm">
        <source src={mediaUrl ?? undefined} type={mediaType ?? undefined} />
      </audio>
    );
  }

  const thumbClass =
    type === "youtube"
      ? "aspect-video w-full max-w-sm object-cover"
      : "h-20 w-20 object-cover";

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play ${title}`}
      className="relative block overflow-hidden rounded"
    >
      {thumbnailUrl ? (
        // Media thumbnails come from arbitrary hosts (podcast CDNs), which
        // next/image remotePatterns cannot cover.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt="" loading="lazy" className={thumbClass} />
      ) : (
        <span className={`block bg-neutral-100 ${thumbClass}`} />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 pl-0.5 text-sm text-white">
          ▶
        </span>
      </span>
      {durationSeconds !== null && durationSeconds > 0 && (
        <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 py-0.5 text-xs text-white">
          {formatDuration(durationSeconds)}
        </span>
      )}
    </button>
  );
}
