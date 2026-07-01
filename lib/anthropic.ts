import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Generous timeout: the digest call streams up to 8192 tokens, which can take
// minutes for a busy week. Background functions allow up to 15 minutes.
const CALL_TIMEOUT_MS = 600_000;

export function summaryModel(): string {
  return process.env.ANTHROPIC_MODEL_SUMMARY || "claude-haiku-4-5";
}

export function digestModel(): string {
  return process.env.ANTHROPIC_MODEL_DIGEST || "claude-sonnet-4-6";
}

export function createAnthropic(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: CALL_TIMEOUT_MS,
  });
}

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
};

export class JsonCallError extends Error {
  rawResponse: string;
  usage: TokenUsage;

  constructor(message: string, rawResponse: string, usage: TokenUsage) {
    super(message);
    this.name = "JsonCallError";
    this.rawResponse = rawResponse;
    this.usage = usage;
  }
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// Calls the model expecting strict JSON: instructs JSON-only output, strips
// code fences defensively, parses, validates with zod, and retries once with
// the validation errors appended. Throws JsonCallError (carrying the raw
// response and accumulated usage) when the retry also fails.
export async function callJson<T>(options: {
  client: Anthropic;
  model: string;
  system?: string;
  prompt: string;
  maxTokens: number;
  schema: z.ZodType<T>;
}): Promise<{ data: T; usage: TokenUsage }> {
  const { client, model, system, prompt, maxTokens, schema } = options;
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

    // Stream and collect the final message: a non-streaming request for a large
    // max_tokens generation can exceed the HTTP timeout and throw before any
    // result is returned. Streaming keeps the connection alive token by token.
    const response = await client.messages
      .stream({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: fullPrompt }],
      })
      .finalMessage();

    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    lastRaw = textOf(response);

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
