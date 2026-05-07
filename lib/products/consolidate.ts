"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import type { ProductVariant } from "@/lib/import/productImportService";

export type ConsolidateResult = {
  removedDuplicates: number;
  variantsAttached: number;
  productsTouched: number;
};

/**
 * Walk products grouped by masterSku. If a group has more than one product
 * (which happens when an earlier import wrote separate Products before the
 * upsert path was wired up), keep the *first* (oldest) Product and roll the
 * rest into it as variants. Leads, search runs, outreach, notes and
 * activities of the merged-away products are re-pointed at the survivor so
 * nothing is lost.
 */
export async function consolidateByMasterSku(): Promise<ConsolidateResult> {
  const user = await requireUser();
  const orgId = user.organizationId;

  const groups = await prisma.product.groupBy({
    by: ["masterSku"],
    where: {
      organizationId: orgId,
      masterSku: { not: null },
    },
    _count: { masterSku: true },
    having: { masterSku: { _count: { gt: 1 } } },
  });

  let removedDuplicates = 0;
  let variantsAttached = 0;
  let productsTouched = 0;

  for (const g of groups) {
    if (!g.masterSku) continue;
    const dups = await prisma.product.findMany({
      where: { organizationId: orgId, masterSku: g.masterSku },
      orderBy: { createdAt: "asc" },
    });
    if (dups.length < 2) continue;

    const survivor = dups[0];
    const losers = dups.slice(1);
    productsTouched += dups.length;

    const variants = (Array.isArray(survivor.variants) ? survivor.variants : []) as ProductVariant[];
    let priceMin = survivor.priceRangeMin ?? null;
    let priceMax = survivor.priceRangeMax ?? null;
    const keywords = new Set(survivor.keywords);
    const exclusions = new Set(survivor.exclusions);

    for (const loser of losers) {
      const sameSinglePrice =
        loser.priceRangeMin !== null &&
        loser.priceRangeMax !== null &&
        loser.priceRangeMin === loser.priceRangeMax;
      const variant: ProductVariant = {
        label: loser.name && loser.name !== survivor.name ? loser.name : undefined,
        url: loser.productUrl ?? undefined,
        price: sameSinglePrice ? loser.priceRangeMin ?? undefined : undefined,
      };
      if (variant.label || variant.url || variant.price !== undefined) {
        variants.push(variant);
        variantsAttached += 1;
      }
      if (loser.priceRangeMin !== null) {
        priceMin = priceMin === null ? loser.priceRangeMin : Math.min(priceMin, loser.priceRangeMin);
      }
      if (loser.priceRangeMax !== null) {
        priceMax = priceMax === null ? loser.priceRangeMax : Math.max(priceMax, loser.priceRangeMax);
      }
      for (const kw of loser.keywords) keywords.add(kw);
      for (const ex of loser.exclusions) exclusions.add(ex);
    }

    const loserIds = losers.map((l) => l.id);

    await prisma.$transaction(async (tx) => {
      await tx.searchRun.updateMany({
        where: { productId: { in: loserIds } },
        data: { productId: survivor.id },
      });
      await tx.lead.updateMany({
        where: { productId: { in: loserIds } },
        data: { productId: survivor.id },
      });
      await tx.productAnalysis.deleteMany({ where: { productId: { in: loserIds } } });
      await tx.product.deleteMany({ where: { id: { in: loserIds } } });
      await tx.product.update({
        where: { id: survivor.id },
        data: {
          variants: variants as unknown as object,
          priceRangeMin: priceMin,
          priceRangeMax: priceMax,
          keywords: Array.from(keywords),
          exclusions: Array.from(exclusions),
        },
      });
    });

    removedDuplicates += losers.length;
  }

  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { removedDuplicates, variantsAttached, productsTouched };
}

/**
 * Deletes products without masterSku that have no leads attached — useful
 * before re-importing a master table cleanly. Products with leads are kept
 * to avoid surprise data loss.
 */
export async function purgeMasterSkulessProducts(): Promise<{ deleted: number; keptWithLeads: number }> {
  return purgeProducts({ onlyMissingMasterSku: true });
}

/**
 * Deletes ALL products that have no leads attached — broader cleanup variant
 * for when an earlier import wrote the wrong column into masterSku and the
 * user wants a fresh re-import.
 */
export async function purgeAllProductsWithoutLeads(): Promise<{ deleted: number; keptWithLeads: number }> {
  return purgeProducts({ onlyMissingMasterSku: false });
}

async function purgeProducts(opts: { onlyMissingMasterSku: boolean }): Promise<{ deleted: number; keptWithLeads: number }> {
  const user = await requireUser();
  const orgId = user.organizationId;

  const candidates = await prisma.product.findMany({
    where: opts.onlyMissingMasterSku
      ? { organizationId: orgId, masterSku: null }
      : { organizationId: orgId },
    select: { id: true, _count: { select: { leads: true } } },
  });

  const safeToDelete = candidates.filter((c) => c._count.leads === 0).map((c) => c.id);
  const keptWithLeads = candidates.length - safeToDelete.length;

  if (safeToDelete.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.productAnalysis.deleteMany({ where: { productId: { in: safeToDelete } } });
      await tx.searchRun.deleteMany({ where: { productId: { in: safeToDelete } } });
      await tx.product.deleteMany({ where: { id: { in: safeToDelete } } });
    });
  }

  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { deleted: safeToDelete.length, keptWithLeads };
}
