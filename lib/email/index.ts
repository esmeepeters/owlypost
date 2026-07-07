import { formatWeekSubject } from "../format.ts";
import { resolveEmailConfig } from "./config.ts";
import { createResendProvider } from "./resend.ts";
import { createSmtpProvider } from "./smtp.ts";
import { renderDigestEmailHtml } from "./render.ts";
import type { EmailConfig } from "./config.ts";
import type { EmailDigest, EmailProvider, EmailProviderName } from "./types.ts";

export { renderDigestEmailHtml } from "./render.ts";
export type { EmailDigest, EmailDigestItem } from "./types.ts";

// Email is optional: when the selected provider (EMAIL_PROVIDER, default
// resend) is missing settings the app skips email and the digest stays
// available in the app only.
export function isEmailConfigured(): boolean {
  return resolveEmailConfig(process.env) !== null;
}

// Read-only status for the settings page.
export function emailDeliveryStatus(): {
  configured: boolean;
  provider: EmailProviderName | null;
  to: string | null;
} {
  const config = resolveEmailConfig(process.env);
  return config
    ? { configured: true, provider: config.provider, to: config.to }
    : { configured: false, provider: null, to: null };
}

function createProvider(config: EmailConfig): EmailProvider {
  switch (config.provider) {
    case "resend":
      return createResendProvider(config.apiKey);
    case "smtp":
      return createSmtpProvider(config);
  }
}

// Reads env at call time (like getLlm) so module load never requires email
// configuration. Returns false instead of throwing: delivery failures never
// fail a digest run.
export async function sendDigestEmail(digest: EmailDigest): Promise<boolean> {
  const config = resolveEmailConfig(process.env);
  if (!config) return false;
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    console.error("Email skipped: SITE_URL is not configured.");
    return false;
  }

  try {
    await createProvider(config).send({
      from: config.from,
      to: config.to,
      subject: `🦉 Owly Post — ${formatWeekSubject(digest.weekStart, digest.weekEnd, process.env.DIGEST_LANGUAGE || "en")}`,
      html: renderDigestEmailHtml(digest, siteUrl),
    });
    return true;
  } catch (error) {
    console.error("Sending digest email failed:", error);
    return false;
  }
}
