import OpenAI from "openai";
import type { AIClient, GenerateJSONArgs, GenerateTextArgs } from "./types";

export function makeOpenAIClient(): AIClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for openai provider");
  }
  const client = new OpenAI({ apiKey });
  const model = process.env.AI_MODEL_OPENAI ?? "gpt-4o-mini";

  return {
    async generateJSON<T>({ system, prompt, schemaName, schemaHint, temperature }: GenerateJSONArgs) {
      const completion = await client.chat.completions.create({
        model,
        temperature: temperature ?? 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${system}\n\nDu antwortest ausschließlich mit gültigem JSON nach diesem Schema (${schemaName}): ${schemaHint}`,
          },
          { role: "user", content: prompt },
        ],
      });
      const content = completion.choices[0]?.message?.content ?? "{}";
      const data = JSON.parse(content) as T;
      return { data, model };
    },
    async generateText({ system, prompt, temperature }: GenerateTextArgs) {
      const completion = await client.chat.completions.create({
        model,
        temperature: temperature ?? 0.5,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      });
      return { text: completion.choices[0]?.message?.content ?? "", model };
    },
  };
}
