import { z } from "zod";
import { JsonCallError } from "./types.ts";
import type { LlmProvider, TokenUsage } from "./types.ts";

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

// Calls the model expecting strict JSON: instructs JSON-only output, strips
// code fences defensively, parses, validates with zod, and retries once with
// the validation errors appended. Throws JsonCallError (carrying the raw
// response and accumulated usage) when the retry also fails.
export async function callJson<T>(options: {
  provider: LlmProvider;
  model: string;
  system?: string;
  prompt: string;
  maxTokens: number;
  schema: z.ZodType<T>;
}): Promise<{ data: T; usage: TokenUsage }> {
  const { provider, model, system, prompt, maxTokens, schema } = options;
  const usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };

  const instruction =
    "Respond with JSON only. No preamble, no explanation, no code fences.";

  let lastError = "";
  let lastRaw = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const fullPrompt =
      attempt === 0
        ? `${prompt}\n\n${instruction}`
        : `${prompt}\n\n${instruction}\n\nYour previous response was invalid:\n${lastError}\n\nRespond again with valid JSON only.`;

    const response = await provider.generateText({
      model,
      ...(system ? { system } : {}),
      prompt: fullPrompt,
      maxTokens,
      expectJson: true,
    });

    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    lastRaw = response.text;

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(lastRaw));
    } catch (error) {
      lastError = `Not parseable as JSON: ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) {
      return { data: result.data, usage };
    }
    lastError = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
  }

  throw new JsonCallError(
    `Model did not return valid JSON after retry: ${lastError}`,
    lastRaw,
    usage,
  );
}

// Plain text call: no JSON instruction, no retry. Callers do their own
// post-processing (e.g. markdown fence stripping).
export async function callText(options: {
  provider: LlmProvider;
  model: string;
  system?: string;
  prompt: string;
  maxTokens: number;
}): Promise<{ text: string; usage: TokenUsage }> {
  const { provider, model, system, prompt, maxTokens } = options;
  const { text, usage } = await provider.generateText({
    model,
    ...(system ? { system } : {}),
    prompt,
    maxTokens,
  });
  return { text, usage };
}
