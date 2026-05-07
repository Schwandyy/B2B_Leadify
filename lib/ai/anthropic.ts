import Anthropic from "@anthropic-ai/sdk";
import type { AIClient, GenerateJSONArgs, GenerateTextArgs } from "./types";

export function makeAnthropicClient(): AIClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for anthropic provider");
  }
  const client = new Anthropic({ apiKey });
  const model = process.env.AI_MODEL_ANTHROPIC ?? "claude-haiku-4-5-20251001";

  return {
    async generateJSON<T>({ system, prompt, schemaName, schemaHint, temperature }: GenerateJSONArgs) {
      const message = await client.messages.create({
        model,
        max_tokens: 2000,
        temperature: temperature ?? 0.3,
        system: `${system}\n\nDu antwortest ausschließlich mit gültigem JSON nach diesem Schema (${schemaName}): ${schemaHint}\nKein Markdown, keine Einleitung — nur das JSON-Objekt.`,
        messages: [{ role: "user", content: prompt }],
      });
      const block = message.content.find((c) => c.type === "text");
      const text = block && "text" in block ? block.text : "{}";
      const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
      const data = JSON.parse(cleaned) as T;
      return { data, model };
    },
    async generateText({ system, prompt, temperature }: GenerateTextArgs) {
      const message = await client.messages.create({
        model,
        max_tokens: 1500,
        temperature: temperature ?? 0.5,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const block = message.content.find((c) => c.type === "text");
      const text = block && "text" in block ? block.text : "";
      return { text, model };
    },
  };
}
