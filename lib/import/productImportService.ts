import { prisma } from "@/lib/db/prisma";
import { analyzeProduct } from "@/lib/ai/productAnalysisService";
import { enrichUrl, enrichmentToText, type EnrichmentResult } from "./linkEnrichment";
import type { ColumnMapping, ImportRow, ProductFieldKey } from "./types";
import type { TargetCustomerType } from "@prisma/client";

export type ImportOptions = {
  enrichLinks: boolean;
  autoAnalyze: boolean;
};

export type ImportItemResult = {
  rowIndex: number;
  productId?: string;
  name?: string;
  enrichment?: { ok: boolean; error?: string; status?: number };
  error?: string;
};

export type ImportRunResult = {
  created: number;
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

    return {
      rowIndex: idx,
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
    };
  });
}

export async function runImport(args: {
  organizationId: string;
  ownerId: string;
  rows: ImportRow[];
  mapping: ColumnMapping;
  options: ImportOptions;
}): Promise<ImportRunResult> {
  const plan = planImport(args.rows, args.mapping);
  const items: ImportItemResult[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of plan) {
    if (!r.name) {
      skipped += 1;
      items.push({ rowIndex: r.rowIndex, error: "Zeile übersprungen — kein Produktname." });
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
        },
      });

      if (args.options.autoAnalyze) {
        try {
          await analyzeProduct(product.id);
        } catch (err) {
          // Analysis failure must not roll back the product import
          // eslint-disable-next-line no-console
          console.error("auto-analyze failed", err);
        }
      }

      created += 1;
      items.push({
        rowIndex: r.rowIndex,
        productId: product.id,
        name: r.name,
        enrichment: enrichmentMeta,
      });
    } catch (err) {
      failed += 1;
      items.push({
        rowIndex: r.rowIndex,
        name: r.name,
        error: err instanceof Error ? err.message : "DB error",
        enrichment: enrichmentMeta,
      });
    }
  }

  return { created, skipped, failed, items };
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
