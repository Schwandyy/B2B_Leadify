import { prisma } from "@/lib/db/prisma";
import { analyzeProduct, toAIInput, type ProductAnalysisJson } from "@/lib/ai/productAnalysisService";
import { generateSearchQueries } from "./queryGeneration";
import { getCompanyDiscoveryProvider } from "./companyDiscovery";
import { dedupKey } from "./dedup";
import { scoreLead } from "./leadScoring";

export type RunSearchOptions = {
  productId: string;
  organizationId: string;
  triggeredById: string;
};

/**
 * Run a research pass for a product:
 *  1. ensure analysis exists
 *  2. generate queries (AI or deterministic)
 *  3. discover companies (provider can be mock / real later)
 *  4. dedupe, score, persist leads
 *  5. return SearchRun id
 */
export async function runResearch(opts: RunSearchOptions): Promise<{ searchRunId: string; total: number; created: number }> {
  const product = await prisma.product.findFirst({
    where: { id: opts.productId, organizationId: opts.organizationId },
    include: { analysis: true },
  });
  if (!product) throw new Error("Product not found in organization");

  // 1. Ensure analysis
  let analysisJson: ProductAnalysisJson;
  if (product.analysis) {
    analysisJson = product.analysis.rawJson as unknown as ProductAnalysisJson;
  } else {
    analysisJson = await analyzeProduct(product.id);
  }

  // Create the SearchRun record
  const run = await prisma.searchRun.create({
    data: {
      organizationId: opts.organizationId,
      productId: product.id,
      triggeredById: opts.triggeredById,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  let created = 0;
  let total = 0;
  try {
    // 2. Queries
    const productInput = toAIInput(product);
    const analysisSummary = `${analysisJson.shortDescription} | Branchen: ${analysisJson.relevantIndustries.join(", ")}`;
    const queries = await generateSearchQueries({ product: productInput, analysisSummary });

    await prisma.searchQuery.createMany({
      data: queries.map((q) => ({
        searchRunId: run.id,
        query: q.query,
        intent: q.intent,
      })),
    });

    // 3. Discovery
    const provider = getCompanyDiscoveryProvider();
    const seen = new Set<string>();
    const optedOut = await prisma.optOutRequest.findMany({
      where: { organizationId: opts.organizationId },
      select: { domain: true, email: true },
    });
    const blockedDomains = new Set(optedOut.map((o) => o.domain).filter(Boolean) as string[]);
    const blockedEmails = new Set(optedOut.map((o) => o.email).filter(Boolean) as string[]);

    for (const q of queries) {
      const companies = await provider.search({
        query: q.query,
        region: product.targetRegion,
        limit: 6,
      });

      for (const company of companies) {
        total += 1;
        const key = dedupKey({ website: company.website, companyName: company.companyName });

        if (seen.has(key)) continue;
        if (blockedDomains.has(key)) continue;
        if (company.contactEmail && blockedEmails.has(company.contactEmail.toLowerCase())) continue;
        seen.add(key);

        // Skip if a lead with this dedup key already exists for the product
        const existing = await prisma.lead.findUnique({
          where: {
            organizationId_productId_dedupKey: {
              organizationId: opts.organizationId,
              productId: product.id,
              dedupKey: key,
            },
          },
        });
        if (existing) continue;

        const score = scoreLead({
          product: {
            targetRegion: product.targetRegion,
            targetCustomerTypes: product.targetCustomerTypes as unknown as string[],
            keywords: product.keywords,
          },
          analysis: analysisJson,
          company,
        });

        await prisma.lead.create({
          data: {
            organizationId: opts.organizationId,
            productId: product.id,
            searchRunId: run.id,
            companyName: company.companyName,
            website: company.website,
            industry: company.industry,
            city: company.city,
            country: company.country,
            description: company.description,
            relevanceReason: score.reason,
            needSignals: score.needSignals,
            productsFound: company.productsFound,
            contactEmail: company.contactEmail?.toLowerCase(),
            contactPhone: company.contactPhone,
            contactPageUrl: company.contactPageUrl,
            imprintUrl: company.imprintUrl,
            contactPerson: company.contactPerson,
            contactRole: company.contactRole,
            score: score.total,
            scoreBreakdown: score.breakdown as unknown as object,
            dataQuality: score.dataQuality,
            dedupKey: key,
            sources: {
              create: company.sources.map((s) => ({
                url: s.url,
                kind: s.kind,
                excerpt: s.excerpt,
              })),
            },
            activities: {
              create: {
                organizationId: opts.organizationId,
                kind: "lead_created",
                message: `Lead aus SearchRun (Score ${score.total}) erstellt.`,
                meta: { score: score.total, query: q.query } as unknown as object,
              },
            },
          },
        });
        created += 1;
      }
    }

    await prisma.searchRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        totalLeads: total,
        newLeads: created,
      },
    });

    await prisma.usageLog.create({
      data: {
        organizationId: opts.organizationId,
        kind: "search_run",
        count: 1,
        meta: { created, total } as unknown as object,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.searchRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: message, finishedAt: new Date() },
    });
    throw err;
  }

  return { searchRunId: run.id, total, created };
}
