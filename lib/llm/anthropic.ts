import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "./types.ts";

// Generous timeout: the digest call streams tens of thousands of tokens, which
// can take minutes for a busy week.
const CALL_TIMEOUT_MS = 600_000;

export function createAnthropicProvider(): LlmProvider {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: CALL_TIMEOUT_MS,
  });

  return {
    // Stream and collect the final message: a non-streaming request for a
    // large max_tokens generation can exceed the HTTP timeout and throw before
    // any result is returned. Streaming keeps the connection alive token by
    // token.
    async generateText({ model, system, prompt, maxTokens }) {
      const response = await client.messages
        .stream({
          model,
          max_tokens: maxTokens,
          ...(system ? { system } : {}),
          messages: [{ role: "user", content: prompt }],
        })
        .finalMessage();

      return {
        text: response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join(""),
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    },
  };
}
