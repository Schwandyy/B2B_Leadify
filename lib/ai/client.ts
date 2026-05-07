import type { AIClient, AIProvider } from "./types";
import { mockAIClient } from "./mock";
import { makeOpenAIClient } from "./openai";
import { makeAnthropicClient } from "./anthropic";

let cached: AIClient | null = null;

/**
 * Returns the configured AI client. Falls back to the mock implementation
 * when API keys are missing — so local dev and CI work without any secrets.
 */
export function getAIClient(): AIClient {
  if (cached) return cached;
  const provider = (process.env.AI_PROVIDER ?? "mock").toLowerCase() as AIProvider;
  switch (provider) {
    case "openai":
      cached = process.env.OPENAI_API_KEY ? makeOpenAIClient() : mockAIClient;
      break;
    case "anthropic":
      cached = process.env.ANTHROPIC_API_KEY ? makeAnthropicClient() : mockAIClient;
      break;
    default:
      cached = mockAIClient;
  }
  return cached;
}
