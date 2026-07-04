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

export type GenerateTextOptions = {
  model: string;
  system?: string;
  prompt: string;
  maxTokens: number;
  // Hint that the caller expects JSON output. Providers may use it to enable a
  // native JSON mode (OpenAI: response_format json_object); the prompt-level
  // "JSON only" instruction remains the universal safety net.
  expectJson?: boolean;
};

export type GenerateTextResult = {
  text: string;
  usage: TokenUsage;
};

export interface LlmProvider {
  generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
}
