import { Resend } from "resend";
import type { EmailMessage, EmailProvider } from "./types.ts";

export function createResendProvider(apiKey: string): EmailProvider {
  return {
    async send(message: EmailMessage): Promise<void> {
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send(message);
      if (error) {
        throw new Error(`Resend error: ${error.name}: ${error.message}`);
      }
    },
  };
}
