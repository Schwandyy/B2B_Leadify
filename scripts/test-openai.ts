import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

import { getAIClient } from "../lib/ai/client";
import { SYSTEM_PROMPT_DE, productAnalysisPrompt } from "../lib/ai/prompts";
import { enrichProduct } from "../lib/import/productEnrichment";

async function main() {
  console.log("AI provider:", process.env.AI_PROVIDER, "model:", process.env.AI_MODEL_OPENAI);

  console.log("\n[1] Crawling Amazon for B074NBCJT1 ...");
  const enrich = await enrichProduct({
    name: "0,96 Zoll I2C OLED Display",
    productUrl: "https://www.amazon.de/dp/B074NBCJT1",
  });
  if (!enrich.ok) {
    console.error("enrichment failed:", enrich.reason);
    process.exit(1);
  }
  const desc = enrich.snapshot.text;
  console.log("    got", desc.length, "chars from", enrich.snapshot.source);

  console.log("\n[2] Asking OpenAI for product analysis ...");
  const client = getAIClient();
  const t0 = Date.now();
  const out = await client.generateJSON<{
    shortDescription: string;
    valueProposition: string;
    relevantIndustries: string[];
    buyerRoles: string[];
    companyTypes: string[];
    searchTerms: string[];
  }>({
    system: SYSTEM_PROMPT_DE,
    prompt: productAnalysisPrompt.build({
      name: "0,96 Zoll I2C OLED Display",
      description: desc,
      productUrl: "https://www.amazon.de/dp/B074NBCJT1",
      category: "Displays",
      targetRegion: "DACH",
      targetCustomerTypes: ["DISTRIBUTOR", "MANUFACTURER", "ENTERPRISE"],
      keywords: [],
      exclusions: [],
      priceRange: null,
    }),
    schemaName: productAnalysisPrompt.schemaName,
    schemaHint: productAnalysisPrompt.schemaHint,
    temperature: 0.3,
  });
  const ms = Date.now() - t0;

  console.log(`    model: ${out.model}, took ${ms} ms`);
  console.log("\n--- short ---\n", out.data.shortDescription);
  console.log("\n--- value ---\n", out.data.valueProposition);
  console.log("\n--- industries ---\n", out.data.relevantIndustries);
  console.log("\n--- buyerRoles ---\n", out.data.buyerRoles);
  console.log("\n--- companyTypes ---\n", out.data.companyTypes);
  console.log("\n--- searchTerms ---\n", out.data.searchTerms);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
