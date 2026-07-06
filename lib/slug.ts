// Stable anchor slug for a digest section, shared by the email renderer and
// the digest page. Lives outside digest.ts to avoid an import cycle
// (digest.ts imports email.ts).
export function sectionSlug(category: string): string {
  const slug = category
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}
