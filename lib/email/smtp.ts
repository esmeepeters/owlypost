import nodemailer from "nodemailer";
import type { EmailMessage, EmailProvider } from "./types.ts";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
};

// One transport per send: the digest mails a single message a week, so
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
