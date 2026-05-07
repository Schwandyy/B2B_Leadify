import {
  fetchAmazonProduct,
  amazonProductToText,
  extractAsin,
  type AmazonProduct,
} from "./amazonCrawler";
import {
  searchAzDeliveryByName,
  azDeliveryToText,
  type AzDeliveryProduct,
} from "./azDeliveryCrawler";

export type ProductSnapshot = {
  source: "amazon" | "az-delivery";
  url: string;
  title?: string;
  brand?: string;
  description?: string;
  bullets: string[];
  specs: Record<string, string>;
  images: string[];
  /** Joined text block — what to feed the AI / store as Product.description. */
  text: string;
};

export type EnrichmentOutcome =
  | { ok: true; snapshot: ProductSnapshot; tried: string[] }
  | { ok: false; reason: string; tried: string[] };

/**
 * Tries to load real product info for a given Product. Strategy:
 *  1. If Amazon URL + ASIN: parse amazon.de/dp/<asin>.
 *  2. Otherwise (or if Amazon yields nothing): search az-delivery.de
 *     by product name and parse the first hit.
 */
export async function enrichProduct(args: { name: string; productUrl?: string | null }): Promise<EnrichmentOutcome> {
  const tried: string[] = [];

  if (args.productUrl) {
    const asin = extractAsin(args.productUrl);
    if (asin) {
      tried.push(`amazon.de/dp/${asin}`);
      const amazon = await fetchAmazonProduct(args.productUrl);
      if (amazon.ok) return { ok: true, snapshot: amazonToSnapshot(amazon), tried };
      // Fall through to AZ-Delivery fallback.
    }
  }

  tried.push(`az-delivery.de search "${args.name}"`);
  const az = await searchAzDeliveryByName(args.name);
  if (az.ok) return { ok: true, snapshot: azToSnapshot(az), tried };

  return { ok: false, reason: az.reason, tried };
}

function amazonToSnapshot(p: AmazonProduct): ProductSnapshot {
  return {
    source: "amazon",
    url: `https://www.amazon.de/dp/${p.asin}`,
    title: p.title,
    brand: p.brand,
    description: p.description,
    bullets: p.bullets,
    specs: p.specs,
    images: p.images,
    text: amazonProductToText(p),
  };
}

function azToSnapshot(p: AzDeliveryProduct): ProductSnapshot {
  return {
    source: "az-delivery",
    url: p.url,
    title: p.title,
    brand: undefined,
    description: p.description,
    bullets: p.bullets,
    specs: p.specs,
    images: p.images,
    text: azDeliveryToText(p),
  };
}
