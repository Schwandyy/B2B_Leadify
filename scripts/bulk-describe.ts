/**
 * Bulk-describe + analyze all products via OpenAI — no crawling.
 *
 * The shop-side rate-limits made the crawl-based pipeline impractical for
 * 487 products in a row. This script asks the AI to produce a technical
 * description from the product's name + AZ-code + variant ASINs, and then
 * runs the existing AI analysis against that description.
 *
 * Usage:
 *   npx tsx scripts/bulk-describe.ts                   # all pending
 *   npx tsx scripts/bulk-describe.ts --limit 5         # 5 only
 *   npx tsx scripts/bulk-describe.ts --force           # re-do all
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

import { prisma } from "../lib/db/prisma";
import { describeAndAnalyze } from "../lib/ai/productDescribeService";

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
const force = flag("force");
const dryRun = flag("dry-run");
const CONCURRENCY = parseInt(param("concurrency") ?? "3", 10);

function isAiGenerated(s: string): boolean {
  return s.includes("Quelle: AI-generiert");
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
      description: true,
      analysis: { select: { id: true } },
    },
  });

  let pending = all.filter((p) => {
    if (force) return true;
    return !(isAiGenerated(p.description) && p.analysis !== null);
  });
  if (limit) pending = pending.slice(0, limit);

  console.log(
    `Total: ${all.length}, pending: ${pending.length}` +
      (limit ? ` (limited to ${limit})` : "") +
      (force ? " [force]" : "") +
      ` · concurrency=${CONCURRENCY}`,
  );

  if (dryRun) {
    for (const p of pending.slice(0, 20)) console.log(`  • ${p.masterSku} ${p.name}`);
    process.exit(0);
  }

  let ok = 0;
  let fail = 0;
  const t0 = Date.now();
  let cursor = 0;

  async function worker(id: number) {
    while (cursor < pending.length) {
      const i = cursor++;
      const p = pending[i];
      try {
        await describeAndAnalyze(p.id);
        ok += 1;
      } catch (err) {
        fail += 1;
        console.log(
          `  worker${id} ${p.masterSku ?? "—"} FAIL ${err instanceof Error ? err.message : err}`,
        );
      }
      if ((i + 1) % 25 === 0 || i + 1 === pending.length) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const rate = ok > 0 ? ((Date.now() - t0) / ok / 1000).toFixed(1) : "?";
        console.log(
          `  worker${id} [${i + 1}/${pending.length}] ok=${ok} fail=${fail} elapsed=${elapsed}s avg=${rate}s/item · last=${p.masterSku ?? "—"}`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));

  console.log(`\nDone. ok=${ok} fail=${fail} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED", e);
  await prisma.$disconnect();
  process.exit(1);
});
