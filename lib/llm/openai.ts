import OpenAI from "openai";
import type { LlmProvider } from "./types.ts";

// Non-streaming with a long timeout: streamed usage reporting is unevenly
// supported across OpenAI-compatible servers, and the SDK keeps the request
// alive for the full window.
const CALL_TIMEOUT_MS = 600_000;

export function createOpenAiProvider(): LlmProvider {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // Optional override for OpenAI-compatible servers (Ollama, OpenRouter,
    // LM Studio, vLLM, ...), e.g. http://localhost:11434/v1
    ...(process.env.OPENAI_BASE_URL
      ? { baseURL: process.env.OPENAI_BASE_URL }
      : {}),
    timeout: CALL_TIMEOUT_MS,
  });

  return {
    async generateText({ model, system, prompt, maxTokens, expectJson }) {
      const response = await client.chat.completions.create({
        model,
        // max_completion_tokens, not max_tokens: reasoning models reject the
        // latter, and compatible servers accept or ignore the former.
        max_completion_tokens: maxTokens,
        // json_object mode requires the word "JSON" in the prompt; callJson's
        // injected instruction satisfies that.
        ...(expectJson ? { response_format: { type: "json_object" as const } } : {}),
        messages: [
          ...(system ? [{ role: "system" as const, content: system }] : []),
          { role: "user" as const, content: prompt },
        ],
      });

      return {
        text: response.choices[0]?.message?.content ?? "",
        // Some OpenAI-compatible servers omit usage; report zeros over crashing.
        usage: {
          input_tokens: response.usage?.prompt_tokens ?? 0,
          output_tokens: response.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}
