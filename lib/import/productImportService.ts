import { prisma } from "@/lib/db/prisma";
import { analyzeProduct } from "@/lib/ai/productAnalysisService";
import { enrichUrl, enrichmentToText } from "./linkEnrichment";
import type { ColumnMapping, ImportRow, ProductFieldKey } from "./types";
import type { TargetCustomerType } from "@prisma/client";

export type ImportOptions = {
  enrichLinks: boolean;
  autoAnalyze: boolean;
};

export type ProductVariant = {
  label?: string;        // "1er", "3er", "5er"
  sku?: string;          // ASIN, EAN
  packSize?: number;
  price?: number;
  url?: string;
  raw?: Record<string, string>; // any other columns from that row
};

export type ImportItemResult = {
  rowIndex: number;          // first row contributing to this product
  productId?: string;
  name?: string;
  masterSku?: string;
  variantsAdded?: number;    // additional variant rows merged in
  enrichment?: { ok: boolean; error?: string; status?: number };
  error?: string;
};

export type ImportRunResult = {
  created: number;
  updated: number;            // products updated by adding variants
  skipped: number;
  failed: number;
  items: ImportItemResult[];
};

const VALID_TARGET_TYPES = new Set<TargetCustomerType>([
  "RESELLER",
  "MANUFACTURER",
  "ENTERPRISE",
  "DISTRIBUTOR",
  "RETAILER",
  "EDUCATION",
  "PUBLIC_SECTOR",
  "SERVICE_PROVIDER",
  "AGENCY",
  "PARTNER",
]);

const TARGET_TYPE_ALIASES: Record<string, TargetCustomerType> = {
  reseller: "RESELLER",
  wiederverkäufer: "RESELLER",
  wiederverkaeufer: "RESELLER",
  hersteller: "MANUFACTURER",
  manufacturer: "MANUFACTURER",
  enterprise: "ENTERPRISE",
  großkunde: "ENTERPRISE",
  grosskunde: "ENTERPRISE",
  konzern: "ENTERPRISE",
  distributor: "DISTRIBUTOR",
  großhändler: "DISTRIBUTOR",
  grosshaendler: "DISTRIBUTOR",
  retailer: "RETAILER",
  händler: "RETAILER",
  haendler: "RETAILER",
  einzelhandel: "RETAILER",
  schule: "EDUCATION",
  schulen: "EDUCATION",
  bildung: "EDUCATION",
  education: "EDUCATION",
  university: "EDUCATION",
  universität: "EDUCATION",
  hochschule: "EDUCATION",
  behörde: "PUBLIC_SECTOR",
  behoerde: "PUBLIC_SECTOR",
  behörden: "PUBLIC_SECTOR",
  public: "PUBLIC_SECTOR",
  service: "SERVICE_PROVIDER",
  dienstleister: "SERVICE_PROVIDER",
  agentur: "AGENCY",
  agency: "AGENCY",
  partner: "PARTNER",
  kooperationspartner: "PARTNER",
};

export type ImportRowPlan = {
  rowIndex: number;
  masterSku?: string;
  name?: string;
  description?: string;
  productUrl?: string;
  category?: string;
  targetRegion?: string;
  targetCustomerTypes: TargetCustomerType[];
  keywords: string[];
  exclusions: string[];
  priceRangeMin?: number;
  priceRangeMax?: number;
  variant: ProductVariant;
  hasVariantSignals: boolean;
};

/**
 * Apply a mapping to the parsed rows and return ready-to-import plan rows.
 * Pure: no DB, no network — used by the preview UI as well.
 */
export function planImport(rows: ImportRow[], mapping: ColumnMapping): ImportRowPlan[] {
  const get = (row: ImportRow, field: ProductFieldKey): string => {
    const header = mapping[field];
    if (!header) return "";
    return (row[header] ?? "").toString().trim();
  };

  return rows.map<ImportRowPlan>((row, idx) => {
    const masterSku = get(row, "masterSku");
    const name = get(row, "name");
    const description = get(row, "description");
    const productUrl = get(row, "productUrl");
    const category = get(row, "category");
    const targetRegion = get(row, "targetRegion");

    const targetCustomerTypes = parseTargetTypes(get(row, "targetCustomerTypes"));
    const keywords = splitTags(get(row, "keywords"));
    const exclusions = splitTags(get(row, "exclusions"));
    const priceRangeMin = parseNumber(get(row, "priceRangeMin"));
    const priceRangeMax = parseNumber(get(row, "priceRangeMax"));

    const variantLabel = get(row, "variantLabel");
    const variantSku = get(row, "variantSku");
    const variantPackSize = parseNumber(get(row, "variantPackSize"));
    const variantPrice = parseDecimal(get(row, "variantPrice"));

    const variant: ProductVariant = {
      label: variantLabel || undefined,
      sku: variantSku || undefined,
      packSize: variantPackSize,
      price: variantPrice,
      url: productUrl || undefined,
    };

    const hasVariantSignals = Boolean(variantLabel || variantSku || variantPackSize || variantPrice);

    return {
      rowIndex: idx,
      masterSku: masterSku || undefined,
      name: name || undefined,
      description: description || undefined,
      productUrl: productUrl || undefined,
      category: category || undefined,
      targetRegion: targetRegion || undefined,
      targetCustomerTypes,
      keywords,
      exclusions,
      priceRangeMin,
      priceRangeMax,
      variant,
      hasVariantSignals,
    };
  });
}

type Group = {
  /** rowIndex of the first row in this group — used as ImportItemResult.rowIndex */
  rowIndex: number;
  masterSku?: string;
  primary: ImportRowPlan;
  variants: ProductVariant[];
};

/**
 * Group plan rows by masterSku. Rows without masterSku each form their own group.
 */
export function groupPlan(plan: ImportRowPlan[]): Group[] {
  const byKey = new Map<string, Group>();
  const groups: Group[] = [];

  for (const r of plan) {
    if (!r.name && !r.masterSku) continue; // empty rows are dropped earlier; defensive

    if (r.masterSku) {
      const existing = byKey.get(r.masterSku);
      if (existing) {
        if (r.hasVariantSignals || r.variant.url || r.variant.price !== undefined) {
          existing.variants.push(r.variant);
        }
        // merge fields the primary didn't have yet
        mergePrimary(existing.primary, r);
        continue;
      }
      const group: Group = {
        rowIndex: r.rowIndex,
        masterSku: r.masterSku,
        primary: { ...r },
        variants: r.hasVariantSignals || r.variant.sku || r.variant.label ? [r.variant] : [],
      };
      byKey.set(r.masterSku, group);
      groups.push(group);
      continue;
    }

    groups.push({
      rowIndex: r.rowIndex,
      primary: { ...r },
      variants: r.hasVariantSignals ? [r.variant] : [],
    });
  }

  return groups;
}

function mergePrimary(primary: ImportRowPlan, extra: ImportRowPlan) {
  if (!primary.name && extra.name) primary.name = extra.name;
  if (!primary.description && extra.description) primary.description = extra.description;
  if (!primary.productUrl && extra.productUrl) primary.productUrl = extra.productUrl;
  if (!primary.category && extra.category) primary.category = extra.category;
  if (!primary.targetRegion && extra.targetRegion) primary.targetRegion = extra.targetRegion;
  if (!primary.targetCustomerTypes.length && extra.targetCustomerTypes.length) {
    primary.targetCustomerTypes = extra.targetCustomerTypes;
  }
  if (!primary.keywords.length && extra.keywords.length) primary.keywords = extra.keywords;
  if (!primary.exclusions.length && extra.exclusions.length) primary.exclusions = extra.exclusions;

  // price range = min/max across the variants we've seen
  if (extra.variant.price !== undefined) {
    if (primary.priceRangeMin === undefined || extra.variant.price < primary.priceRangeMin) {
      primary.priceRangeMin = Math.round(extra.variant.price);
    }
    if (primary.priceRangeMax === undefined || extra.variant.price > primary.priceRangeMax) {
      primary.priceRangeMax = Math.round(extra.variant.price);
    }
  } else {
    if (primary.priceRangeMin === undefined && extra.priceRangeMin !== undefined) {
      primary.priceRangeMin = extra.priceRangeMin;
    }
    if (primary.priceRangeMax === undefined && extra.priceRangeMax !== undefined) {
      primary.priceRangeMax = extra.priceRangeMax;
    }
  }
}

export async function runImport(args: {
  organizationId: string;
  ownerId: string;
  rows: ImportRow[];
  mapping: ColumnMapping;
  options: ImportOptions;
}): Promise<ImportRunResult> {
  const plan = planImport(args.rows, args.mapping);
  const groups = groupPlan(plan);
  const items: ImportItemResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const g of groups) {
    const r = g.primary;
    if (!r.name) {
      skipped += 1;
      items.push({ rowIndex: g.rowIndex, error: "Zeile übersprungen — kein Produktname." });
      continue;
    }

    let description = r.description ?? "";
    let enrichmentMeta: ImportItemResult["enrichment"] | undefined;

    if (args.options.enrichLinks && r.productUrl) {
      const result = await enrichUrl(r.productUrl);
      enrichmentMeta = { ok: result.ok, error: result.error, status: result.status };
      const enriched = enrichmentToText(result);
      if (enriched) {
        description = description ? `${description}\n\n--- Aus Produktseite ---\n${enriched}` : enriched;
      }
    }

    if (!description) {
      description = `Produktimport ohne Beschreibung — Name: ${r.name}.`;
    }

    try {
      const variants = dedupVariants(g.variants);
      let productRecord: { id: string };

      if (r.masterSku) {
        // re-imports must not duplicate — upsert on (organizationId, masterSku).
        // We check existence first so we can correctly count created vs. updated.
        const existing = await prisma.product.findUnique({
          where: {
            organizationId_masterSku: {
              organizationId: args.organizationId,
              masterSku: r.masterSku,
            },
          },
          select: { id: true },
        });

        const data = {
          name: r.name,
          description,
          productUrl: r.productUrl ?? null,
          category: r.category ?? null,
          targetRegion: r.targetRegion ?? null,
          targetCustomerTypes: r.targetCustomerTypes,
          keywords: r.keywords,
          exclusions: r.exclusions,
          priceRangeMin: r.priceRangeMin ?? null,
          priceRangeMax: r.priceRangeMax ?? null,
          variants: variants as unknown as object,
        };

        if (existing) {
          await prisma.product.update({ where: { id: existing.id }, data });
          productRecord = existing;
          updated += 1;
        } else {
          const product = await prisma.product.create({
            data: {
              organizationId: args.organizationId,
              ownerId: args.ownerId,
              masterSku: r.masterSku,
              ...data,
            },
          });
          productRecord = product;
          created += 1;
        }
      } else {
        const product = await prisma.product.create({
          data: {
            organizationId: args.organizationId,
            ownerId: args.ownerId,
            name: r.name,
            description,
            productUrl: r.productUrl ?? null,
            category: r.category ?? null,
            targetRegion: r.targetRegion ?? null,
            targetCustomerTypes: r.targetCustomerTypes,
            keywords: r.keywords,
            exclusions: r.exclusions,
            priceRangeMin: r.priceRangeMin ?? null,
            priceRangeMax: r.priceRangeMax ?? null,
            variants: variants.length ? (variants as unknown as object) : undefined,
          },
        });
        productRecord = product;
        created += 1;
      }

      if (args.options.autoAnalyze) {
        try {
          await analyzeProduct(productRecord.id);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("auto-analyze failed", err);
        }
      }

      items.push({
        rowIndex: g.rowIndex,
        productId: productRecord.id,
        name: r.name,
        masterSku: r.masterSku,
        variantsAdded: variants.length,
        enrichment: enrichmentMeta,
      });
    } catch (err) {
      failed += 1;
      items.push({
        rowIndex: g.rowIndex,
        name: r.name,
        masterSku: r.masterSku,
        error: err instanceof Error ? err.message : "DB error",
        enrichment: enrichmentMeta,
      });
    }
  }

  return { created, updated, skipped, failed, items };
}

function dedupVariants(variants: ProductVariant[]): ProductVariant[] {
  const seen = new Set<string>();
  const out: ProductVariant[] = [];
  for (const v of variants) {
    const key = `${v.sku ?? ""}|${v.label ?? ""}|${v.packSize ?? ""}|${v.price ?? ""}|${v.url ?? ""}`.toLowerCase();
    if (key === "||||") continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function parseTargetTypes(raw: string): TargetCustomerType[] {
  if (!raw) return [];
  const tokens = raw
    .split(/[,;|/\n]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
  const out = new Set<TargetCustomerType>();
  for (const t of tokens) {
    const upper = t.toUpperCase().replace(/[^A-Z_]/g, "_");
    if (VALID_TARGET_TYPES.has(upper as TargetCustomerType)) {
      out.add(upper as TargetCustomerType);
      continue;
    }
    const lower = t.toLowerCase().replace(/[^a-zäöüß]/g, "");
    const alias = TARGET_TYPE_ALIASES[lower];
    if (alias) out.add(alias);
  }
  return Array.from(out);
}

function splitTags(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|\n]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function parseNumber(raw: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}

function parseDecimal(raw: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}
