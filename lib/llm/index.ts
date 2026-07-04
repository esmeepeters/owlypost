import { z } from "zod";
import { callJson, callText } from "./call.ts";
import { createAnthropicProvider } from "./anthropic.ts";
import { createOpenAiProvider } from "./openai.ts";
import type { LlmProvider, TokenUsage } from "./types.ts";

export { JsonCallError } from "./types.ts";
export type { TokenUsage, LlmProvider } from "./types.ts";

export type LlmProviderName = "anthropic" | "openai";

export type Llm = {
  provider: LlmProviderName;
  summaryModel: string;
  digestModel: string;
  callJson<T>(options: {
    model: string;
    system?: string;
    prompt: string;
    maxTokens: number;
    schema: z.ZodType<T>;
  }): Promise<{ data: T; usage: TokenUsage }>;
  callText(options: {
    model: string;
    system?: string;
    prompt: string;
    maxTokens: number;
  }): Promise<{ text: string; usage: TokenUsage }>;
};

const DEFAULT_MODELS: Record<LlmProviderName, { summary: string; digest: string }> = {
  anthropic: { summary: "claude-haiku-4-5", digest: "claude-sonnet-4-6" },
  openai: { summary: "gpt-5-mini", digest: "gpt-5" },
};

// Reads env at call time (call sites resolve the provider once per run, so
// construction cost is irrelevant and module load never requires an API key).
export function getLlm(): Llm {
  const name = (process.env.LLM_PROVIDER || "anthropic") as LlmProviderName;

  let provider: LlmProvider;
  switch (name) {
    case "anthropic":
      provider = createAnthropicProvider();
      break;
    case "openai":
      provider = createOpenAiProvider();
      break;
    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${name}" (expected "anthropic" or "openai")`,
      );
  }

  const defaults = DEFAULT_MODELS[name];

  return {
    provider: name,
    summaryModel: process.env.LLM_MODEL_SUMMARY || defaults.summary,
    digestModel: process.env.LLM_MODEL_DIGEST || defaults.digest,
    callJson: (options) => callJson({ provider, ...options }),
    callText: (options) => callText({ provider, ...options }),
  };
}
