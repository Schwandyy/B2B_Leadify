import { prisma } from "@/lib/db/prisma";
import { getAIClient } from "./client";
import { SYSTEM_PROMPT_DE } from "./prompts";
import { analyzeProduct } from "./productAnalysisService";

export type DescribeResult = {
  ok: true;
  text: string;
  model: string;
};

type AIDescribePayload = {
  shortTechnicalDescription: string;
  bullets: string[];
  specs: Record<string, string>;
  applicationContext: string;
};

const SCHEMA_HINT = `{
  "shortTechnicalDescription": string,
  "bullets": string[],
  "specs": { [key: string]: string },
  "applicationContext": string
}`;

/**
 * Asks the AI to write a clean, technical product description from the
 * product name + AZ master SKU + ASIN list. We use this when we cannot
 * crawl the source page (rate-limit, no URL, etc.).
 *
 * The output is plain enough that the existing analyzeProduct() step
 * downstream can produce a meaningful B2B analysis from it.
 */
export async function describeProductWithAI(productId: string): Promise<DescribeResult> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, masterSku: true, name: true, category: true, variants: true, organizationId: true },
  });
  if (!product) throw new Error("Product not found");

  const variants = (Array.isArray(product.variants) ? product.variants : []) as Array<{
    sku?: string;
    label?: string;
    packSize?: number;
  }>;
  const asins = variants
    .map((v) => v.sku)
    .filter((s): s is string => typeof s === "string" && /^[A-Z0-9]{10}$/.test(s));

  const prompt = [
    "Schreibe für das folgende AZ-Delivery-Produkt einen sachlichen, technisch präzisen Beschreibungstext für einen B2B-Produktkatalog.",
    "Wenn du die exakte Variante nicht kennst, halte dich an das, was sich aus Name, AZ-Code und ASIN ableiten lässt.",
    "Keine Marketing-Floskeln, keine Story, keine Werbeworte.",
    "",
    `AZ-Code: ${product.masterSku ?? "—"}`,
    `Produktname: ${product.name}`,
    `Kategorie: ${product.category ?? "—"}`,
    asins.length ? `Bekannte ASINs der Pack-Varianten: ${asins.join(", ")}` : "",
    "",
    "Output-Felder:",
    "- shortTechnicalDescription: 1-2 Sätze, technische Definition des Produkts",
    "- bullets: 4-6 Stichpunkte zu Eigenschaften (Schnittstellen, Spannungen, Pins, Auflösung, …)",
    "- specs: Tabelle 'Schlüssel → Wert' für die wichtigsten technischen Daten",
    "- applicationContext: 1-2 Sätze, in welchen B2B-Kontexten das Produkt eingesetzt wird",
    "",
    "Bei Unsicherheit: lieber ehrlich 'unbekannt' als spekulativ.",
  ]
    .filter(Boolean)
    .join("\n");

  const ai = getAIClient();
  const { data, model } = await ai.generateJSON<AIDescribePayload>({
    system: SYSTEM_PROMPT_DE,
    prompt,
    schemaName: "ProductDescribe",
    schemaHint: SCHEMA_HINT,
    temperature: 0.2,
  });

  const lines: string[] = [];
  lines.push(`Titel: ${product.name}`);
  if (product.masterSku) lines.push(`AZ-Code: ${product.masterSku}`);
  lines.push("");
  lines.push(`Kurzbeschreibung: ${data.shortTechnicalDescription}`);
  if (data.bullets?.length) {
    lines.push("");
    lines.push("Highlights:");
    for (const b of data.bullets) lines.push(`- ${b}`);
  }
  if (data.specs && Object.keys(data.specs).length) {
    lines.push("");
    lines.push("Technische Daten:");
    for (const [k, v] of Object.entries(data.specs)) lines.push(`- ${k}: ${v}`);
  }
  if (data.applicationContext) {
    lines.push("");
    lines.push(`Einsatzkontext: ${data.applicationContext}`);
  }
  if (asins.length) {
    lines.push("");
    lines.push(`ASINs der Pack-Varianten: ${asins.join(", ")}`);
  }
  lines.push("");
  lines.push(`Quelle: AI-generiert auf Basis von ${product.masterSku ?? "Produktname"}`);

  const text = lines.join("\n");

  await prisma.product.update({
    where: { id: product.id },
    data: { description: text },
  });
  await prisma.productAnalysis.deleteMany({ where: { productId: product.id } });

  return { ok: true, text, model };
}

export async function describeAndAnalyze(productId: string): Promise<{ describeModel: string }> {
  const r = await describeProductWithAI(productId);
  await analyzeProduct(productId);
  return { describeModel: r.model };
}
