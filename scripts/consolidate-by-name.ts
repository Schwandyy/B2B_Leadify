/**
 * One-shot data fix: consolidate the imported master table where each
 * pack variant ("1 x ...", "3 x ...", "5 x ...") was written as its own
 * Product row.
 *
 * Strategy:
 *  - Group by normalised stem of the product name + category.
 *  - Pick the smallest pack as master, attach the rest as variants.
 *  - Extract ASINs from amazon.de/dp/<ASIN> URLs.
 *  - Generate sequential master SKUs AZ001, AZ002, ... per organization.
 *  - Re-point leads + searchRuns to the survivor.
 *
 * Run: npx tsx scripts/consolidate-by-name.ts            # dry-run
 *      npx tsx scripts/consolidate-by-name.ts --apply    # actually write
 */

import { prisma } from "../lib/db/prisma";
import type { Prisma } from "@prisma/client";

type Variant = {
  label?: string;
  sku?: string;
  packSize?: number;
  url?: string;
  price?: number;
};

const APPLY = process.argv.includes("--apply");

function stripPackSize(name: string): { stem: string; packSize?: number } {
  // Match "N x <rest>" where N is a positive integer.
  const m = name.match(/^\s*(\d+)\s*x\s+(.+)$/i);
  if (m) {
    const packSize = parseInt(m[1], 10);
    return { stem: m[2].trim(), packSize: Number.isFinite(packSize) ? packSize : undefined };
  }
  return { stem: name.trim() };
}

function normaliseStem(stem: string): string {
  return stem
    .toLowerCase()
    .normalize("NFKD")
    .replace(/̀-ͯ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAsin(url: string | null): string | undefined {
  if (!url) return undefined;
  const m = url.match(/\/dp\/([A-Z0-9]{10})\b/i);
  return m?.[1]?.toUpperCase();
}

function canonicaliseUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  const asin = extractAsin(trimmed);
  if (asin && /amazon\./i.test(trimmed)) {
    return `https://www.amazon.de/dp/${asin}`;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function variantLabel(packSize: number | undefined, asin: string | undefined): string | undefined {
  if (packSize !== undefined) return `${packSize}er Pack`;
  return asin;
}

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true, slug: true } });

  for (const org of orgs) {
    const products = await prisma.product.findMany({
      where: { organizationId: org.id },
      orderBy: [{ createdAt: "asc" }],
      include: { _count: { select: { leads: true, searchRuns: true } } },
    });

    // Build groups keyed by normalised stem + category.
    type GroupItem = (typeof products)[number] & { _stem: string; _packSize?: number };
    const groups = new Map<string, GroupItem[]>();

    for (const p of products) {
      // Skip the demo seed product so it stays untouched.
      if (p.name === "Arduino Starter Kit für Schulen") continue;
      const { stem, packSize } = stripPackSize(p.name);
      const norm = normaliseStem(stem);
      const cat = (p.category ?? "").toLowerCase().trim();
      // Only consolidate when stem is distinctive enough (>= 5 chars).
      if (norm.length < 5) continue;
      const key = `${norm}||${cat}`;
      const item = Object.assign(p, { _stem: stem, _packSize: packSize }) as GroupItem;
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }

    const groupsToMerge = Array.from(groups.values()).filter((g) => g.length > 1);
    let nextAzNum = 1;

    console.log(`\n=== Org "${org.name}" (${org.slug}) ===`);
    console.log(`  total products:           ${products.length}`);
    console.log(`  groupable name-stems:     ${groups.size}`);
    console.log(`  multi-variant groups:     ${groupsToMerge.length}`);
    const survivors = groupsToMerge.length;
    const losers = groupsToMerge.reduce((sum, g) => sum + (g.length - 1), 0);
    console.log(`  → after consolidation:    ${products.length - losers} products (${losers} merged into variants)`);

    if (!APPLY) {
      // Dry-run: show first 5 groups
      for (const g of groupsToMerge.slice(0, 5)) {
        console.log(`\n  group: "${g[0]._stem}" (${g[0].category ?? "—"})`);
        for (const p of g) {
          console.log(`    • ${p.name}  pack=${p._packSize ?? "?"}  url=${p.productUrl ?? "—"}  asin=${extractAsin(p.productUrl) ?? "—"}`);
        }
      }
      continue;
    }

    // Real run.
    for (const group of groupsToMerge) {
      // Choose master: pack=1 if exists, otherwise smallest packSize, otherwise first.
      const sorted = [...group].sort((a, b) => {
        const ap = a._packSize ?? 9999;
        const bp = b._packSize ?? 9999;
        if (ap !== bp) return ap - bp;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      const master = sorted[0];
      const losersInGroup = sorted.slice(1);

      // Collect variants from master + losers.
      const variants: Variant[] = [];
      const variantKeys = new Set<string>();

      function pushVariant(p: GroupItem) {
        const asin = extractAsin(p.productUrl);
        const v: Variant = {
          label: variantLabel(p._packSize, asin),
          sku: asin,
          packSize: p._packSize,
          url: canonicaliseUrl(p.productUrl),
          price:
            p.priceRangeMin !== null && p.priceRangeMax !== null && p.priceRangeMin === p.priceRangeMax
              ? p.priceRangeMin
              : undefined,
        };
        // Dedup variants on (asin, packSize) — URL-form differences (with/without https://www.) collapse here.
        const key = `${v.sku ?? "?"}|${v.packSize ?? "?"}`;
        if (variantKeys.has(key)) return;
        variantKeys.add(key);
        if (v.label || v.sku || v.url || v.packSize) variants.push(v);
      }

      pushVariant(master);
      for (const l of losersInGroup) pushVariant(l);

      let priceMin = master.priceRangeMin;
      let priceMax = master.priceRangeMax;
      const keywordsSet = new Set<string>(master.keywords);
      const exclusionsSet = new Set<string>(master.exclusions);

      for (const l of losersInGroup) {
        if (l.priceRangeMin !== null) {
          priceMin = priceMin === null ? l.priceRangeMin : Math.min(priceMin, l.priceRangeMin);
        }
        if (l.priceRangeMax !== null) {
          priceMax = priceMax === null ? l.priceRangeMax : Math.max(priceMax, l.priceRangeMax);
        }
        for (const kw of l.keywords) keywordsSet.add(kw);
        for (const ex of l.exclusions) exclusionsSet.add(ex);
      }

      // Reserve a fresh AZ-Code that is not yet taken in this org.
      let azCode: string;
      while (true) {
        azCode = `AZ${String(nextAzNum).padStart(3, "0")}`;
        nextAzNum += 1;
        const taken = await prisma.product.findUnique({
          where: { organizationId_masterSku: { organizationId: org.id, masterSku: azCode } },
          select: { id: true },
        });
        if (!taken) break;
      }

      const newName = master._stem; // strip the "N x " prefix from master name
      const loserIds = losersInGroup.map((l) => l.id);

      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.searchRun.updateMany({
              where: { productId: { in: loserIds } },
              data: { productId: master.id },
            });
            await tx.lead.updateMany({
              where: { productId: { in: loserIds } },
              data: { productId: master.id },
            });
            await tx.productAnalysis.deleteMany({ where: { productId: { in: loserIds } } });
            // Drop losers (cascade handles their notes/activities/outreach).
            await tx.product.deleteMany({ where: { id: { in: loserIds } } });

            await tx.product.update({
              where: { id: master.id },
              data: {
                masterSku: azCode,
                name: newName,
                priceRangeMin: priceMin,
                priceRangeMax: priceMax,
                keywords: Array.from(keywordsSet),
                exclusions: Array.from(exclusionsSet),
                variants: variants as unknown as Prisma.InputJsonValue,
              },
            });
          },
          { timeout: 30_000 },
        );
      } catch (err) {
        console.error(`  ! group "${master._stem}" failed:`, err instanceof Error ? err.message : err);
      }
    }

    console.log(`  applied: merged ${losers} losers into ${survivors} masters, generated AZ001–AZ${String(nextAzNum - 1).padStart(3, "0")}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED", e);
  await prisma.$disconnect();
  process.exit(1);
});
