import type { ColumnMapping, ProductFieldKey } from "./types";

// Keywords that should match a header (case-insensitive substring).
// Long, specific phrases come first per field — autoMap picks the highest score.
const FIELD_HINTS: Record<ProductFieldKey, string[]> = {
  masterSku: [
    // workspace-spezifische Codes
    "az-code",
    "az code",
    "az-nummer",
    "az nummer",
    "az-nr",
    "az nr",
    "az-art",
    "interne artikelnummer",
    "interner code",
    "intern artikel",
    // klassische Master-SKU-Bezeichner
    "master sku",
    "master-sku",
    "stamm-artikel",
    "stamm artikel",
    "stamm-sku",
    "parent sku",
    "parent-sku",
    "master",
    "stamm",
    "produkt-id",
    "product id",
    "artikelnummer",
    "artikel-nr",
    "art-nr",
    "art nr",
    // generisches "sku" zuletzt — soll nicht "Variant-SKU" überstimmen
    "sku",
  ],
  name: ["produktname", "product name", "artikelname", "bezeichnung", "title", "titel", "name", "produkt", "artikel"],
  description: ["beschreibung", "description", "produktbeschreibung", "details", "kurzbeschreibung", "long_description", "info"],
  productUrl: ["produkt-url", "produktlink", "product url", "product link", "shoplink", "shop_url", "datenblatt", "page", "website", "link", "url"],
  category: ["kategorie", "category", "warengruppe", "produktgruppe", "segment", "type", "typ"],
  targetRegion: ["zielregion", "region", "country", "land", "market", "markt"],
  targetCustomerTypes: ["zielkunde", "zielgruppe", "kundentyp", "customer type", "target customer", "kundengruppe", "buyer", "audience"],
  keywords: ["keywords", "schlagworte", "stichworte", "search terms", "tags"],
  exclusions: ["ausschluss", "exclusions", "blacklist", "exclude", "nicht für"],
  priceRangeMin: ["preis von", "preis min", "price min", "min price", "vk min", "ek min", "ek-min", "vk-min"],
  priceRangeMax: ["preis bis", "preis max", "price max", "max price", "vk max", "ek max", "uvp", "list price", "ek-max", "vk-max"],
  variantLabel: ["variante", "variant", "ausführung", "ausfuehrung", "pack", "größe", "groesse", "size"],
  variantSku: ["asin", "ean", "gtin", "varianten-sku", "variant sku", "varianten sku", "barcode", "isbn"],
  variantPackSize: ["stückzahl", "stueckzahl", "anzahl", "menge", "pack size", "packgröße", "packgroesse"],
  variantPrice: ["ek", "vk", "preis", "price", "uvp", "vk-preis", "ek-preis"],
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
