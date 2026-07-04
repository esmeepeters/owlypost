import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { callJson, callText } from "./call.ts";
import { JsonCallError } from "./types.ts";
import type { LlmProvider } from "./types.ts";

const schema = z.object({ answer: z.string() });

function fakeProvider(responses: string[]): {
  provider: LlmProvider;
  prompts: string[];
} {
  const prompts: string[] = [];
  let call = 0;
  return {
    prompts,
    provider: {
      async generateText({ prompt }) {
        prompts.push(prompt);
        const text = responses[call];
        call++;
        return { text, usage: { input_tokens: 10, output_tokens: 5 } };
      },
    },
  };
}

test("callJson parses valid JSON on the first attempt", async () => {
  const { provider, prompts } = fakeProvider(['{"answer": "42"}']);
  const result = await callJson({
    provider,
    model: "m",
    prompt: "What is the answer?",
    maxTokens: 100,
    schema,
  });

  assert.deepEqual(result.data, { answer: "42" });
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 5 });
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].startsWith("What is the answer?"));
  assert.ok(prompts[0].includes("Respond with JSON only."));
});

test("callJson strips code fences", async () => {
  const { provider } = fakeProvider(['```json\n{"answer": "fenced"}\n```']);
  const result = await callJson({
    provider,
    model: "m",
    prompt: "p",
    maxTokens: 100,
    schema,
  });

  assert.deepEqual(result.data, { answer: "fenced" });
});

test("callJson retries on unparseable JSON and accumulates usage", async () => {
  const { provider, prompts } = fakeProvider([
    "not json at all",
    '{"answer": "second try"}',
  ]);
  const result = await callJson({
    provider,
    model: "m",
    prompt: "p",
    maxTokens: 100,
    schema,
  });

  assert.deepEqual(result.data, { answer: "second try" });
  assert.deepEqual(result.usage, { input_tokens: 20, output_tokens: 10 });
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1].includes("Your previous response was invalid"));
  assert.ok(prompts[1].includes("Not parseable as JSON"));
});

test("callJson feeds zod validation errors into the retry prompt", async () => {
  const { provider, prompts } = fakeProvider([
    '{"wrong_key": true}',
    '{"answer": "fixed"}',
  ]);
  const result = await callJson({
    provider,
    model: "m",
    prompt: "p",
    maxTokens: 100,
    schema,
  });

  assert.deepEqual(result.data, { answer: "fixed" });
  assert.ok(prompts[1].includes("answer"));
});

test("callJson throws JsonCallError with raw response and usage after two failures", async () => {
  const { provider } = fakeProvider(["nope", "still nope"]);

  await assert.rejects(
    callJson({ provider, model: "m", prompt: "p", maxTokens: 100, schema }),
    (error: unknown) => {
      assert.ok(error instanceof JsonCallError);
      assert.equal(error.rawResponse, "still nope");
      assert.deepEqual(error.usage, { input_tokens: 20, output_tokens: 10 });
      return true;
    },
  );
});

test("callText passes prompt and result through untouched", async () => {
  const { provider, prompts } = fakeProvider(["Some **markdown**."]);
  const result = await callText({
    provider,
    model: "m",
    prompt: "Write markdown",
    maxTokens: 100,
  });

  assert.equal(result.text, "Some **markdown**.");
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 5 });
  assert.deepEqual(prompts, ["Write markdown"]);
});
