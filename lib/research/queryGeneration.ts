import { getAIClient } from "@/lib/ai/client";
import { SYSTEM_PROMPT_DE, searchQueriesPrompt, type ProductInput } from "@/lib/ai/prompts";

type Query = { query: string; intent: string };

/**
 * Generates concrete search queries for the research engine. Falls back to
 * a deterministic local generator if the AI client returns nothing useful —
 * keeps the engine deterministic in tests.
 */
export async function generateSearchQueries(args: {
  product: ProductInput;
  analysisSummary: string;
}): Promise<Query[]> {
  const ai = getAIClient();
  try {
    const { data } = await ai.generateJSON<{ queries: Query[] }>({
      system: SYSTEM_PROMPT_DE,
      prompt: searchQueriesPrompt.build(args.product, args.analysisSummary),
      schemaName: searchQueriesPrompt.schemaName,
      schemaHint: searchQueriesPrompt.schemaHint,
      temperature: 0.4,
    });
    if (data?.queries?.length) return data.queries.slice(0, 10);
  } catch {
    // fall through to deterministic generator
  }
  return deterministicQueries(args.product);
}

function deterministicQueries(p: ProductInput): Query[] {
  const region = p.targetRegion ?? "Deutschland";
  const baseTokens = [...p.keywords, p.category ?? "", p.name].filter(Boolean).slice(0, 3);
  const out: Query[] = [];
  for (const t of baseTokens) {
    out.push({ query: `${t} ${region} B2B`, intent: "Branche & Region" });
    out.push({ query: `${t} Beschaffung Impressum`, intent: "Beschaffungskontakt" });
  }
  for (const ct of p.targetCustomerTypes.slice(0, 3)) {
    out.push({ query: `${ct} ${region}`, intent: "Zielkundentyp" });
  }
  return out.slice(0, 8);
}
