import { Resend } from "resend";
import type { Verdict } from "./types.ts";

// Email is optional: when any of these is missing the app skips email and
// the digest stays available in the app only.
export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.DIGEST_EMAIL_FROM &&
      process.env.DIGEST_EMAIL_TO,
  );
}

export type EmailDigestItem = {
  digestItemId: string;
  title: string;
  url: string | null;
  sourceTitle: string;
  verdict: Verdict;
  reason: string;
};

export type EmailDigest = {
  digestId: string;
  weekStart: string;
  weekEnd: string;
  introMd: string;
  closingMd: string;
  sections: {
    category: string;
    narrativeMd: string;
    items: EmailDigestItem[];
  }[];
};

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

// Simple HTML email with inline styles, no framework. Every item links to
// the digest page in the app, anchored at that item card.
export function renderDigestEmailHtml(
  digest: EmailDigest,
  siteUrl: string,
): string {
  const base = siteUrl.replace(/\/$/, "");
  const digestUrl = `${base}/digests/${digest.digestId}`;

  const sectionsHtml = digest.sections
    .map((section) => {
      const itemsHtml = section.items
        .map((item) => {
          const badge = VERDICT_BADGES[item.verdict];
          const anchorUrl = `${digestUrl}#item-${item.digestItemId}`;
          const titleHtml = item.url
            ? `<a href="${escapeHtml(item.url)}" style="color:#171717; text-decoration:none; font-weight:600;">${escapeHtml(item.title)}</a>`
            : `<span style="font-weight:600;">${escapeHtml(item.title)}</span>`;
          return `
            <div style="border:1px solid #e5e5e5; border-radius:6px; padding:12px 14px; margin:0 0 10px 0;">
              <span style="display:inline-block; font-size:11px; font-weight:600; padding:2px 6px; border-radius:4px; ${badge.style}">${badge.label}</span>
              <div style="margin-top:6px; font-size:15px;">${titleHtml}</div>
              <div style="margin-top:2px; font-size:12px; color:#a3a3a3;">${escapeHtml(item.sourceTitle)}</div>
              <div style="margin-top:6px; font-size:14px; color:#525252; line-height:1.5;">${escapeHtml(item.reason)}</div>
              <div style="margin-top:8px; font-size:12px;"><a href="${anchorUrl}" style="color:#b45309;">Rate this verdict →</a></div>
            </div>`;
        })
        .join("\n");

      return `
        <h2 style="font-size:17px; margin:28px 0 6px 0;">${escapeHtml(section.category)}</h2>
        ${section.narrativeMd ? `<div style="font-size:14px; color:#525252;">${mdToHtml(section.narrativeMd)}</div>` : ""}
        ${itemsHtml}`;
    })
    .join("\n");

  return `<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#fafafa;">
    <div style="max-width:600px; margin:0 auto; padding:32px 20px; font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif; color:#171717; background:#ffffff;">
      <p style="font-size:13px; color:#b45309; font-weight:600; margin:0 0 4px 0;">🦉 Owly Post</p>
      <h1 style="font-size:21px; margin:0 0 20px 0;">Week of ${escapeHtml(digest.weekStart)} – ${escapeHtml(digest.weekEnd)}</h1>
      <div style="font-size:15px;">${mdToHtml(digest.introMd)}</div>
      ${sectionsHtml}
      ${digest.closingMd ? `<div style="margin-top:28px; padding-top:16px; border-top:1px solid #e5e5e5; font-size:14px; color:#525252;">${mdToHtml(digest.closingMd)}</div>` : ""}
      <p style="margin-top:24px; font-size:12px; color:#a3a3a3;">
        <a href="${digestUrl}" style="color:#b45309;">Open this digest in Owly Post</a>
      </p>
    </div>
  </body>
</html>`;
}

export async function sendDigestEmail(digest: EmailDigest): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    console.error("Email skipped: SITE_URL is not configured.");
    return false;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.DIGEST_EMAIL_FROM!,
    to: process.env.DIGEST_EMAIL_TO!,
    subject: `🦉 Owly Post — week of ${digest.weekStart}`,
    html: renderDigestEmailHtml(digest, siteUrl),
  });

  if (error) {
    console.error("Sending digest email failed:", error);
    return false;
  }
  return true;
}
