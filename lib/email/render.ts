import { formatWeekRange } from "../format.ts";
import { sectionSlug } from "../slug.ts";
import type { Verdict } from "../types.ts";
import type { EmailDigest } from "./types.ts";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Minimal markdown-to-HTML for the digest prose (escaped first, then
// paragraphs, bold, italic and links).
function mdToHtml(md: string): string {
  return md
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => {
      const inline = escapeHtml(paragraph.replace(/\n/g, " ").trim())
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(
          /\[([^\]]+)\]\((https?:[^)]+)\)/g,
          '<a href="$2" style="color:#b45309;">$1</a>',
        );
      return `<p style="margin:0 0 12px 0; line-height:1.6;">${inline}</p>`;
    })
    .join("\n");
}

const VERDICT_BADGES: Record<Verdict, { label: string; style: string }> = {
  must_read: {
    label: "MUST READ",
    style: "background:#b45309; color:#ffffff;",
  },
  worth_it: { label: "WORTH IT", style: "background:#dcfce7; color:#166534;" },
  skip: { label: "SKIP", style: "background:#f5f5f5; color:#737373;" },
};

// Simple HTML email with inline styles, no framework. Item titles link to the
// external article; the small "Rate" links deep-link into the digest page in
// the app (anchored at the item / section) where ratings are saved. Items
// with verdict skip are not rendered.
export function renderDigestEmailHtml(
  digest: EmailDigest,
  siteUrl: string,
): string {
  const language = process.env.DIGEST_LANGUAGE || "en";
  const base = siteUrl.replace(/\/$/, "");
  const digestUrl = `${base}/digests/${digest.digestId}`;

  const sectionsHtml = digest.sections
    .map((section) => {
      const itemsHtml = section.items
        .filter((item) => item.verdict !== "skip")
        .map((item) => {
          const badge = VERDICT_BADGES[item.verdict];
          const anchorUrl = `${digestUrl}#item-${item.digestItemId}`;
          const titleHtml = item.url
            ? `<a href="${escapeHtml(item.url)}" style="color:#171717; text-decoration:none; font-weight:600;">${escapeHtml(item.title)}</a>`
            : `<span style="font-weight:600;">${escapeHtml(item.title)}</span>`;
          return `
            <div style="margin:0 0 8px 0;">
              <div style="font-size:14px; line-height:1.45;">
                <span style="display:inline-block; font-size:10px; font-weight:600; padding:1px 5px; border-radius:3px; vertical-align:1px; ${badge.style}">${badge.label}</span>
                ${titleHtml}
                <span style="font-size:12px; color:#a3a3a3;">&nbsp;·&nbsp;${escapeHtml(item.sourceTitle)}</span>
              </div>
              <div style="font-size:12px; color:#525252; line-height:1.4; margin-top:1px;">
                ${escapeHtml(item.reason)}
                &nbsp;<a href="${anchorUrl}" style="color:#b45309; text-decoration:none;">Rate →</a>
              </div>
            </div>`;
        })
        .join("\n");

      const sectionAnchor = `${digestUrl}#section-${sectionSlug(section.category)}`;
      return `
        <h2 style="font-size:17px; margin:28px 0 6px 0;">${escapeHtml(section.category)}</h2>
        ${section.narrativeMd ? `<div style="font-size:15px; color:#171717;">${mdToHtml(section.narrativeMd)}</div>` : ""}
        <div style="font-size:12px; margin:4px 0 14px 0;"><a href="${sectionAnchor}" style="color:#b45309;">Rate this summary →</a></div>
        ${itemsHtml}`;
    })
    .join("\n");

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0; padding:0; background:#fafafa;">
    <div style="max-width:600px; margin:0 auto; padding:32px 20px; font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif; color:#171717; background:#ffffff;">
      <p style="font-size:13px; color:#b45309; font-weight:600; margin:0 0 4px 0;">🦉 Owly Post</p>
      <h1 style="font-size:21px; margin:0 0 20px 0;">${escapeHtml(formatWeekRange(digest.weekStart, digest.weekEnd, language))}</h1>
      ${sectionsHtml}
      <p style="margin-top:24px; font-size:12px; color:#a3a3a3;">
        <a href="${digestUrl}" style="color:#b45309;">Open this digest in Owly Post</a>
      </p>
    </div>
  </body>
</html>`;
}
