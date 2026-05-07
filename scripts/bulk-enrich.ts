/**
 * Bulk-enrich existing products: crawl Amazon (or AZ-Delivery fallback)
 * for the real description, then ask OpenAI to produce a fresh
 * ProductAnalysis. Idempotent — re-runs skip products that already
 * have both a real description and an analysis.
 *
 * Usage:
 *   npx tsx scripts/bulk-enrich.ts --limit 5 --dry-run   # preview 5
 *   npx tsx scripts/bulk-enrich.ts --limit 5             # apply 5
 *   npx tsx scripts/bulk-enrich.ts --only-missing        # default
 *   npx tsx scripts/bulk-enrich.ts --force               # re-do all
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

import { prisma } from "../lib/db/prisma";
import { enrichProduct } from "../lib/import/productEnrichment";
import { analyzeProduct } from "../lib/ai/productAnalysisService";

const argv = process.argv.slice(2);
function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}
function param(name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}
const limitRaw = param("limit");
const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
const dryRun = flag("dry-run");
const force = flag("force");
const skipAnalysis = flag("skip-analysis");
const skipAmazon = flag("skip-amazon");
const skipAzDelivery = flag("skip-az-delivery");
const ANALYSIS_CONCURRENCY = 4; // parallel OpenAI calls

function looksLikeRealDescription(s: string): boolean {
  // Real Amazon/AZ-Delivery descriptions start with "Titel:" (our snapshot
  // text format) or contain "Highlights:". Anything else is the fallback
  // placeholder or the original CSV description.
  if (s.length < 200) return false;
  if (s.startsWith("Produktimport ohne Beschreibung")) return false;
  if (s.startsWith("Titel:") || s.includes("Highlights:") || s.includes("Quelle:")) return true;
  return false;
}

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, slug: true } });
  const targetOrg = orgs.find((o) => o.slug !== "demo-org");
  if (!targetOrg) {
    console.error("No non-demo org found.");
    process.exit(1);
  }

  const all = await prisma.product.findMany({
    where: { organizationId: targetOrg.id },
    orderBy: { masterSku: "asc" },
    select: {
      id: true,
      masterSku: true,
      name: true,
      productUrl: true,
      description: true,
      analysis: { select: { id: true } },
      variants: true,
    },
  });

  let pending = all.filter((p) => {
    if (force) return true;
    const hasRealDescription = looksLikeRealDescription(p.description);
    const hasAnalysis = p.analysis !== null;
    return !(hasRealDescription && hasAnalysis);
  });

  if (limit) pending = pending.slice(0, limit);

  console.log(
    `Total products: ${all.length}, pending enrichment: ${pending.length}` +
      (limit ? ` (limited to ${limit})` : "") +
      (force ? " [force]" : ""),
  );
  if (dryRun) {
    for (const p of pending.slice(0, 20)) {
      console.log(`  • ${p.masterSku} ${p.name} (url=${p.productUrl ?? "—"})`);
    }
    process.exit(0);
  }

  let crawled = 0;
  let crawlFailed = 0;
  let analyzed = 0;
  let analysisFailed = 0;
  const t0 = Date.now();

  // -- Phase 1: crawl real description -- runs sequentially because the
  // amazon-de host is rate-limited per domain.
  console.log("\n[Phase 1] Crawling product descriptions ...");
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    const productUrl = pickUrl(p);
    const result = await enrichProduct({
      name: p.name,
      productUrl,
      options: { skipAmazon, skipAzDelivery },
    });
    if (!result.ok) {
      crawlFailed += 1;
      console.log(`  [${i + 1}/${pending.length}] ${p.masterSku ?? "—"} FAIL ${result.reason}`);
      continue;
    }
    await prisma.product.update({
      where: { id: p.id },
      data: { description: result.snapshot.text },
    });
    // Wipe any stale analysis so phase 2 always re-runs.
    await prisma.productAnalysis.deleteMany({ where: { productId: p.id } });
    crawled += 1;
    if ((i + 1) % 25 === 0 || i + 1 === pending.length) {
      const ms = Date.now() - t0;
      console.log(
        `  [${i + 1}/${pending.length}] ok=${crawled} fail=${crawlFailed} elapsed=${(ms / 1000).toFixed(1)}s ` +
          `(last: ${result.snapshot.source} → ${p.masterSku ?? "—"})`,
      );
    }
  }

  if (skipAnalysis) {
    console.log(`\nSkipping AI analysis (--skip-analysis). Crawl: ${crawled} ok, ${crawlFailed} fail.`);
    process.exit(0);
  }

  // -- Phase 2: OpenAI analysis, parallelised lightly --
  const toAnalyze = await prisma.product.findMany({
    where: {
      organizationId: targetOrg.id,
      analysis: { is: null },
      id: { in: pending.map((p) => p.id) },
    },
    select: { id: true, masterSku: true, name: true },
  });
  console.log(`\n[Phase 2] AI analysis for ${toAnalyze.length} products ...`);

  let cursor = 0;
  async function worker(id: number) {
    while (cursor < toAnalyze.length) {
      const i = cursor++;
      const p = toAnalyze[i];
      try {
        await analyzeProduct(p.id);
        analyzed += 1;
      } catch (err) {
        analysisFailed += 1;
        console.log(`  worker${id} ${p.masterSku ?? "—"} FAIL ${err instanceof Error ? err.message : err}`);
      }
      if ((i + 1) % 25 === 0 || i + 1 === toAnalyze.length) {
        console.log(
          `  worker${id} [${i + 1}/${toAnalyze.length}] ok=${analyzed} fail=${analysisFailed} ` +
            `(last: ${p.masterSku ?? "—"})`,
        );
      }
    }
  }
  await Promise.all(
    Array.from({ length: ANALYSIS_CONCURRENCY }, (_, i) => worker(i + 1)),
  );

  const totalMs = Date.now() - t0;
  console.log(
    `\nDone. crawled=${crawled} (fail=${crawlFailed}), analyzed=${analyzed} (fail=${analysisFailed}), elapsed=${(totalMs / 1000).toFixed(1)}s`,
  );
  await prisma.$disconnect();
}

function pickUrl(p: { productUrl: string | null; variants: unknown }): string | null {
  if (p.productUrl) return p.productUrl;
  if (Array.isArray(p.variants)) {
    for (const v of p.variants) {
      if (v && typeof v === "object" && "url" in v && typeof (v as { url?: unknown }).url === "string") {
        return (v as { url: string }).url;
      }
    }
  }
  return null;
}

main().catch(async (e) => {
  console.error("FAILED", e);
  await prisma.$disconnect();
  process.exit(1);
});
