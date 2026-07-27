import nodemailer from "nodemailer";
import type { EmailConfig } from "./config.ts";
import type { EmailMessage, EmailProvider } from "./types.ts";

export type SmtpConfig = Extract<EmailConfig, { provider: "smtp" }>;

// One transport per send: the digest mails at most one message a day, so
// connection pooling buys nothing. Timeouts keep a hung SMTP server from
// stalling the worker's digest job.
export function createSmtpProvider(config: SmtpConfig): EmailProvider {
  return {
    async send(message: EmailMessage): Promise<void> {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
        connectionTimeout: 30_000,
        greetingTimeout: 30_000,
        socketTimeout: 60_000,
      });
      try {
        await transporter.sendMail(message);
      } finally {
        transporter.close();
      }
    },
  };
}
