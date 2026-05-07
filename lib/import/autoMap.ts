import type { ColumnMapping, ProductFieldKey } from "./types";

// Keywords that should match a header (case-insensitive substring).
const FIELD_HINTS: Record<ProductFieldKey, string[]> = {
  name: ["produktname", "product name", "artikelname", "artikel", "bezeichnung", "title", "titel", "name", "produkt"],
  description: ["beschreibung", "description", "produktbeschreibung", "details", "info", "kurzbeschreibung", "long_description"],
  productUrl: ["produkt-url", "produktlink", "product url", "product link", "url", "website", "link", "shoplink", "shop_url", "page", "datenblatt"],
  category: ["kategorie", "category", "warengruppe", "produktgruppe", "type", "typ", "segment"],
  targetRegion: ["region", "zielregion", "country", "land", "market", "markt"],
  targetCustomerTypes: ["zielgruppe", "zielkunde", "kundentyp", "customer type", "target customer", "kundengruppe", "buyer", "audience"],
  keywords: ["keywords", "schlagworte", "tags", "stichworte", "such", "search terms"],
  exclusions: ["ausschluss", "exclusions", "blacklist", "exclude", "nicht für"],
  priceRangeMin: ["preis von", "preis min", "price min", "min price", "vk min", "ek min"],
  priceRangeMax: ["preis bis", "preis max", "price max", "max price", "vk max", "ek max", "uvp", "list price"],
};

const FIELDS = Object.keys(FIELD_HINTS) as ProductFieldKey[];

/**
 * Suggest a mapping based on header names. Greedy: each field claims the
 * best matching header that is still free.
 */
export function autoMap(headers: string[]): ColumnMapping {
  const used = new Set<string>();
  const mapping: ColumnMapping = {};

  for (const field of FIELDS) {
    const candidate = bestHeaderFor(field, headers, used);
    if (candidate) {
      mapping[field] = candidate;
      used.add(candidate);
    }
  }
  return mapping;
}

function bestHeaderFor(field: ProductFieldKey, headers: string[], used: Set<string>): string | null {
  const hints = FIELD_HINTS[field];
  let best: { header: string; score: number } | null = null;
  for (const h of headers) {
    if (used.has(h)) continue;
    const lower = h.toLowerCase();
    let score = 0;
    for (const hint of hints) {
      if (lower === hint) score = Math.max(score, 100);
      else if (lower.startsWith(hint)) score = Math.max(score, 80);
      else if (lower.includes(hint)) score = Math.max(score, 60);
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { header: h, score };
    }
  }
  return best?.header ?? null;
}
