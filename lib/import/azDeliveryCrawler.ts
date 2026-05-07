import * as cheerio from "cheerio";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept-Language": "de-DE,de;q=0.9",
  Accept: "text/html,application/xhtml+xml",
};

const SEARCH_URL = "https://www.az-delivery.de/search";
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_500_000;

export type AzDeliveryProduct = {
  ok: true;
  url: string;
  title?: string;
  description?: string;
  bullets: string[];
  specs: Record<string, string>;
  images: string[];
};

export type AzDeliveryFail = { ok: false; reason: string };
export type AzDeliveryResult = AzDeliveryProduct | AzDeliveryFail;

/**
 * Search az-delivery.de by product name and return the first matching
 * product page parsed into a structured snapshot. AZ-Delivery runs on
 * Shopify so the product detail page exposes a JSON-LD Product object,
 * which gives us a clean description without screen-scraping markup.
 */
export async function searchAzDeliveryByName(name: string): Promise<AzDeliveryResult> {
  const cleaned = name.trim();
  if (!cleaned) return { ok: false, reason: "Leerer Suchbegriff." };

  const search = await get(`${SEARCH_URL}?type=product&q=${encodeURIComponent(cleaned)}`);
  if (search.kind !== "ok") return { ok: false, reason: search.reason };

  const $ = cheerio.load(search.html);

  // Sammle alle Produkt-Pfade auf der Seite (eindeutig).
  const productPaths: string[] = [];
  const seenPaths = new Set<string>();
  $('a[href^="/products/"]').each((_, el) => {
    const href = $(el).attr("href")!;
    const path = href.split("?")[0];
    if (!seenPaths.has(path)) {
      seenPaths.add(path);
      productPaths.push(path);
    }
  });

  // Filter den 'Default-Empfehlungs-Produkte'-Eintrag heraus, der bei 0-Treffer-Suchen
  // als Featured-Tile angezeigt wird (Solarpanel).
  const RECOMMENDATION_FALLBACK_PATH =
    "/products/50w-tragbares-solarpanel-mit-efte-beschichtung-solarpanel-faltbar-mit-usb-type-c-dc-anschluss-solartasche-ip67-wasserdicht-camping-solar-panel-fur-outdoor-wohnmobil-caravan";
  const realPaths = productPaths.filter((p) => p !== RECOMMENDATION_FALLBACK_PATH);

  if (realPaths.length === 0) {
    return { ok: false, reason: `Keine Treffer auf az-delivery.de für "${cleaned}".` };
  }

  // Bevorzuge Links aus dem Such-Result-Container.
  let firstProductPath: string | null = null;
  $(".collection a[href^='/products/'], .product-grid a[href^='/products/'], main a[href^='/products/']").each(
    (_, el) => {
      if (firstProductPath) return false;
      const href = $(el).attr("href")!;
      const path = href.split("?")[0];
      if (path === RECOMMENDATION_FALLBACK_PATH) return undefined;
      firstProductPath = path;
      return undefined;
    },
  );
  if (!firstProductPath) firstProductPath = realPaths[0];

  const productUrl = `https://www.az-delivery.de${firstProductPath}`;
  const product = await get(productUrl);
  if (product.kind !== "ok") return { ok: false, reason: product.reason };

  return parseProductPage(product.html, productUrl);
}

type GetOk = { kind: "ok"; html: string };
type GetFail = { kind: "fail"; reason: string };

async function get(url: string): Promise<GetOk | GetFail> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow", signal: controller.signal });
    if (!res.ok) return { kind: "fail", reason: `HTTP ${res.status}` };
    const html = await readLimited(res, MAX_BYTES);
    return { kind: "ok", html };
  } catch (err) {
    return { kind: "fail", reason: err instanceof Error ? err.message : "fetch fehlgeschlagen" };
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const decoder = new TextDecoder("utf-8");
  let received = 0;
  let out = "";
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

function parseProductPage(html: string, url: string): AzDeliveryResult {
  const $ = cheerio.load(html);

  // 1. Try JSON-LD (most reliable on Shopify). Shopify often wraps in <script type="application/ld+json">.
  type JsonLd = { name?: string; description?: string; image?: string | string[]; "@type"?: string };
  const jsonLdMatches: JsonLd[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).contents().text();
      const data = JSON.parse(text);
      const obj = Array.isArray(data) ? data.find((d) => d?.["@type"] === "Product") : data;
      if (obj && obj["@type"] === "Product") jsonLdMatches.push(obj as JsonLd);
    } catch {
      /* ignore malformed JSON */
    }
  });
  const ld: JsonLd | undefined = jsonLdMatches[0];

  const titleFromMarkup = clean($("h1.product-title, h1.product__title, h1").first().text());
  const title = ld?.name ?? titleFromMarkup ?? undefined;

  const descriptionRaw =
    ld?.description ??
    clean($('meta[name="description"]').attr("content") ?? "");
  const description = stripHtml(descriptionRaw) || undefined;

  // Bullets from product description list items, if any.
  const bullets: string[] = [];
  $(".product-description li, .rte li").each((_, li) => {
    const text = clean($(li).text());
    if (text && text.length >= 4 && text.length <= 250) bullets.push(text);
  });

  // Light specs from definition lists if present.
  const specs: Record<string, string> = {};
  $(".product-description dl dt").each((_, dt) => {
    const k = clean($(dt).text());
    const v = clean($(dt).next("dd").text());
    if (k && v) specs[k] = v;
  });

  const images: string[] = [];
  if (ld?.image) {
    const img = ld.image;
    if (typeof img === "string") images.push(img);
    else if (Array.isArray(img)) for (const i of img) if (typeof i === "string") images.push(i);
  }

  if (!title && !description) {
    return { ok: false, reason: "Produkt-Seite gefunden, aber keine Produktdaten extrahierbar." };
  }

  return {
    ok: true,
    url,
    title,
    description,
    bullets: dedup(bullets).slice(0, 10),
    specs,
    images: dedup(images).slice(0, 4),
  };
}

function clean(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function dedup<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function azDeliveryToText(p: AzDeliveryProduct): string {
  const parts: string[] = [];
  if (p.title) parts.push(`Titel: ${p.title}`);
  if (p.bullets.length) parts.push("Highlights:\n- " + p.bullets.join("\n- "));
  if (p.description) parts.push(`Beschreibung: ${p.description}`);
  const specEntries = Object.entries(p.specs).slice(0, 12);
  if (specEntries.length) {
    parts.push("Technische Daten:\n" + specEntries.map(([k, v]) => `- ${k}: ${v}`).join("\n"));
  }
  parts.push(`Quelle: ${p.url}`);
  return parts.join("\n\n");
}
