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
 * Tries to load real product info for a given Product.
 *
 * For AZ-Delivery products (the typical case in this workspace), the home
 * shop on az-delivery.de is the cleanest source: Shopify-based, exposes a
 * JSON-LD Product object, no anti-bot. We try it first by name. Only when
 * that fails do we fall through to amazon.de — Amazon will rate-limit any
 * server-side crawler aggressively, so it must not be the default path.
 */
export async function enrichProduct(args: {
  name: string;
  productUrl?: string | null;
  options?: EnrichOptions;
}): Promise<EnrichmentOutcome> {
  const tried: string[] = [];
  const opts: EnrichOptions = args.options ?? {};
  let lastReason = "Kein Crawl-Pfad versucht.";

  if (!opts.skipAzDelivery) {
    tried.push(`az-delivery.de search "${args.name}"`);
    const az = await searchAzDeliveryByName(args.name);
    if (az.ok) return { ok: true, snapshot: azToSnapshot(az), tried };
    lastReason = `AZ-Delivery: ${az.reason}`;
  }

  if (!opts.skipAmazon && args.productUrl) {
    const asin = extractAsin(args.productUrl);
    if (asin) {
      tried.push(`amazon.de/dp/${asin}`);
      const amazon = await fetchAmazonProduct(args.productUrl);
      if (amazon.ok) return { ok: true, snapshot: amazonToSnapshot(amazon), tried };
      lastReason = `Amazon: ${amazon.reason}`;
    }
  }

  return { ok: false, reason: lastReason, tried };
}

export type EnrichOptions = {
  skipAmazon?: boolean;
  skipAzDelivery?: boolean;
};

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
