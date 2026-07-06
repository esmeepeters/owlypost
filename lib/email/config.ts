export type EmailConfig = { from: string; to: string } & (
  | { provider: "resend"; apiKey: string }
  | {
      provider: "smtp";
      host: string;
      port: number;
      secure: boolean;
      auth?: { user: string; pass: string };
    }
);

// Pure so it is unit-testable: callers pass process.env. Email is optional,
// so an incomplete or invalid configuration resolves to null (with a warning
// where the intent was clearly to enable email) instead of throwing — a
// misconfigured mailer must never take the digest run down with it.
export function resolveEmailConfig(
  env: Record<string, string | undefined>,
): EmailConfig | null {
  const provider = env.EMAIL_PROVIDER || "resend";
  const from = env.DIGEST_EMAIL_FROM;
  const to = env.DIGEST_EMAIL_TO;

  if (provider === "resend") {
    if (!env.RESEND_API_KEY || !from || !to) return null;
    return { provider, from, to, apiKey: env.RESEND_API_KEY };
  }

  if (provider === "smtp") {
    if (!env.SMTP_HOST || !from || !to) return null;
    const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : 587;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.warn(`Email disabled: invalid SMTP_PORT "${env.SMTP_PORT}".`);
      return null;
    }
    // secure means implicit TLS from the first byte (the port 465 model);
    // insecure ports upgrade via STARTTLS when the server offers it.
    const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
    return {
      provider,
      from,
      to,
      host: env.SMTP_HOST,
      port,
      secure,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS || "" }
        : undefined,
    };
  }

  console.warn(
    `Email disabled: unknown EMAIL_PROVIDER "${provider}" (expected "resend" or "smtp").`,
  );
  return null;
}
