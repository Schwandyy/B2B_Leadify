// Shared AI types — kept independent of any provider SDK
export type AIProvider = "mock" | "openai" | "anthropic";

export type GenerateJSONArgs = {
  system: string;
  prompt: string;
  schemaName: string;
  schemaHint: string; // human-readable description of expected shape
  temperature?: number;
};

export type GenerateTextArgs = {
  system: string;
  prompt: string;
  temperature?: number;
};

export interface AIClient {
  /**
   * Generate a structured JSON response. The implementation MUST coerce
   * the model output to an object that matches the caller's expected shape.
   * Returns the parsed object plus the model identifier used.
   */
  generateJSON<T>(args: GenerateJSONArgs): Promise<{ data: T; model: string }>;

  generateText(args: GenerateTextArgs): Promise<{ text: string; model: string }>;
}
