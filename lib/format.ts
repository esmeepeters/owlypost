// Render-time localization of digest dates. Storage stays ISO (yyyy-MM-dd);
// "en" and anything unrecognized keep the ISO/English output unchanged, with
// other languages (currently only "nl" has labels) opting in on top.

const WEEK_LABELS: Record<
  string,
  { title: string; subject: string; separator: string }
> = {
  en: { title: "Week of", subject: "week of", separator: "–" },
  nl: { title: "Week van", subject: "week van", separator: "t/m" },
};

function weekLabels(language: string) {
  return WEEK_LABELS[language] ?? WEEK_LABELS.en;
}

export function formatDigestDate(isoDate: string, language: string): string {
  if (language === "en") return isoDate;
  try {
    // An ISO date-only string parses as UTC midnight, so format in UTC to
    // avoid shifting a day in the server's local timezone.
    return new Intl.DateTimeFormat(language, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

export function formatWeekRange(
  weekStart: string,
  weekEnd: string,
  language: string,
): string {
  const { title, separator } = weekLabels(language);
  return `${title} ${formatDigestDate(weekStart, language)} ${separator} ${formatDigestDate(weekEnd, language)}`;
}

export function formatWeekSubject(weekStart: string, language: string): string {
  const { subject } = weekLabels(language);
  return `${subject} ${formatDigestDate(weekStart, language)}`;
}

export function formatShortDate(date: Date, language: string): string {
  try {
    return date.toLocaleDateString(language === "en" ? "en-GB" : language);
  } catch {
    return date.toLocaleDateString("en-GB");
  }
}

export function formatShortDateTime(date: Date, language: string): string {
  try {
    return date.toLocaleString(language === "en" ? "en-GB" : language);
  } catch {
    return date.toLocaleString("en-GB");
  }
}
