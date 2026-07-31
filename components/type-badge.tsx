import type { SourceType } from "@/lib/types";

// No badge for plain rss: it is the default and carries no information.
const TYPE_STYLES: Record<SourceType, string | null> = {
  rss: null,
  youtube: "bg-red-50 text-red-700 border-red-200",
  podcast: "bg-purple-50 text-purple-700 border-purple-200",
  reddit: "bg-orange-50 text-orange-700 border-orange-200",
};

export function TypeBadge({ type }: { type: SourceType }) {
  const style = TYPE_STYLES[type];
  if (!style) return null;
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs ${style}`}>
      {type}
    </span>
  );
}
