import type { Verdict } from "../types.ts";

export type EmailProviderName = "resend" | "smtp";

export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

// A provider delivers one message and throws on failure; sendDigestEmail
// turns that into a boolean plus a log line so callers never have to care.
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
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
  // Only set for quiet weeks (no sections): the short no-items message.
  quietMessage?: string;
  sections: {
    category: string;
    narrativeMd: string;
    items: EmailDigestItem[];
  }[];
};
