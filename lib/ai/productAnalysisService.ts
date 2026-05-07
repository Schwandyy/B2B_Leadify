import { prisma } from "@/lib/db/prisma";
import { getAIClient } from "./client";
import { SYSTEM_PROMPT_DE, productAnalysisPrompt, type ProductInput } from "./prompts";
import type { Product } from "@prisma/client";

export type ProductAnalysisJson = {
  shortDescription: string;
  valueProposition: string;
  problemsSolved: string[];
  relevantIndustries: string[];
  buyerRoles: string[];
  companyTypes: string[];
  searchTerms: string[];
  competitorOverlap: string[];
  pitchArguments: string[];
  objections: string[];
  searchStrategy: string;
};

export function toAIInput(product: Product): ProductInput {
  return {
    name: product.name,
    description: product.description,
    productUrl: product.productUrl,
    category: product.category,
    targetRegion: product.targetRegion,
    targetCustomerTypes: product.targetCustomerTypes as unknown as string[],
    keywords: product.keywords,
    exclusions: product.exclusions,
    priceRange:
      product.priceRangeMin || product.priceRangeMax
        ? `${product.priceRangeMin ?? "?"}-${product.priceRangeMax ?? "?"} ${product.currency}`
        : null,
  };
}

export async function analyzeProduct(productId: string): Promise<ProductAnalysisJson> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Product not found");

  const ai = getAIClient();
  const input = toAIInput(product);

  const { data, model } = await ai.generateJSON<ProductAnalysisJson>({
    system: SYSTEM_PROMPT_DE,
    prompt: productAnalysisPrompt.build(input),
    schemaName: productAnalysisPrompt.schemaName,
    schemaHint: productAnalysisPrompt.schemaHint,
    temperature: 0.3,
  });

  await prisma.productAnalysis.upsert({
    where: { productId },
    create: {
      productId,
      shortDescription: data.shortDescription ?? "",
      valueProposition: data.valueProposition ?? "",
      problemsSolved: data.problemsSolved ?? [],
      relevantIndustries: data.relevantIndustries ?? [],
      buyerRoles: data.buyerRoles ?? [],
      companyTypes: data.companyTypes ?? [],
      searchTerms: data.searchTerms ?? [],
      competitorOverlap: data.competitorOverlap ?? [],
      pitchArguments: data.pitchArguments ?? [],
      objections: data.objections ?? [],
      searchStrategy: data.searchStrategy ?? "",
      rawJson: data as unknown as object,
      model,
    },
    update: {
      shortDescription: data.shortDescription ?? "",
      valueProposition: data.valueProposition ?? "",
      problemsSolved: data.problemsSolved ?? [],
      relevantIndustries: data.relevantIndustries ?? [],
      buyerRoles: data.buyerRoles ?? [],
      companyTypes: data.companyTypes ?? [],
      searchTerms: data.searchTerms ?? [],
      competitorOverlap: data.competitorOverlap ?? [],
      pitchArguments: data.pitchArguments ?? [],
      objections: data.objections ?? [],
      searchStrategy: data.searchStrategy ?? "",
      rawJson: data as unknown as object,
      model,
    },
  });

  await prisma.usageLog.create({
    data: { organizationId: product.organizationId, kind: "ai_analysis" },
  });

  return data;
}
