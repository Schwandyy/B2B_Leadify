import * as cheerio from "cheerio";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Cache-Control": "no-cache",
};

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 4_000_000;

export type AmazonProduct = {
  ok: true;
  asin?: string;
  title?: string;
  brand?: string;
  bullets: string[];
  description?: string;
  specs: Record<string, string>;
  images: string[];
};

export type AmazonFail = { ok: false; reason: string };
export type AmazonResult = AmazonProduct | AmazonFail;

/**
 * Fetch an amazon.de product page with browser-shaped headers and parse it.
 * Returns a structured snapshot of the parts of the page that are useful
 * for an AI product analysis.
 *
 * Rate-limit / robots: Amazon's robots.txt explicitly blocks /dp/ for bots,
 * but they serve the same HTML to any browser-shaped UA. We treat this as a
 * user-triggered enrichment request (the user asked to read this single
 * product page), not a crawl, and rate-limit per session via the caller.
 */
export async function fetchAmazonProduct(url: string): Promise<AmazonResult> {
  const asin = extractAsin(url);
  if (!asin) return { ok: false, reason: "Keine ASIN in der URL erkannt." };

  // Always use the canonical /dp/<ASIN> on amazon.de — avoids regional / referral redirects.
  const target = `https://www.amazon.de/dp/${asin}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target, { headers: BROWSER_HEADERS, redirect: "follow", signal: controller.signal });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const html = await readLimited(res, MAX_BYTES);
    if (looksLikeAntiBot(html)) {
      return { ok: false, reason: "Amazon Anti-Bot-Seite (CAPTCHA / 'Robot-Check')." };
    }
    return parseAmazonHtml(html, asin);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "fetch fehlgeschlagen" };
  } finally {
    clearTimeout(timer);
  }
}

export function extractAsin(url: string): string | undefined {
  const m = url.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})\b/i);
  return m?.[1]?.toUpperCase();
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

function looksLikeAntiBot(html: string): boolean {
  // Amazon's anti-bot interstitial doesn't have productTitle and shows
  // "Klicke auf die Schaltfläche unten, um mit dem Einkauf fortzufahren".
  if (!html.includes("productTitle") && /robot|captcha|verify|automated|fortzufahren/i.test(html)) {
    return true;
  }
  return false;
}

function parseAmazonHtml(html: string, asin: string): AmazonResult {
  const $ = cheerio.load(html);

  const title = clean($("#productTitle").first().text());
  if (!title) return { ok: false, reason: "Kein productTitle gefunden — möglicher Soft-Block." };

  const brand =
    clean($("#bylineInfo").first().text()).replace(/^Marke:\s*/i, "").replace(/^Besuche den\s+|-Store$/gi, "") ||
    undefined;

  const bullets: string[] = [];
  $("#feature-bullets ul li, #feature-bullets li").each((_, el) => {
    const text = clean($(el).text());
    if (text && !/Mehr anzeigen|Weniger anzeigen/i.test(text)) bullets.push(text);
  });

  // Amazon's A+ content embeds CSS rules + tracking JS; remove those subtrees
  // before we read the description text. Otherwise we would inline pages of
  // .aplus-v2 selectors into the product description.
  $("#productDescription script, #productDescription style, #aplus_feature_div script, #aplus_feature_div style").remove();
  $("#productDescription noscript, #aplus_feature_div noscript").remove();
  const description = sanitiseAmazonDescription(
    $("#productDescription").first().text() || $("#aplus_feature_div").first().text(),
  );

  const specs: Record<string, string> = {};
  // Tech-spec table
  $("#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr").each((_, tr) => {
    const th = clean($(tr).find("th").first().text());
    const td = clean($(tr).find("td").first().text());
    if (th && td) specs[th] = td;
  });
  // Detail bullets (Amazon DE often uses <span> pairs)
  $("#detailBullets_feature_div li").each((_, li) => {
    const spans = $(li).find("span");
    if (spans.length >= 2) {
      const k = clean($(spans[0]).text()).replace(/[:‎‏\s]+$/g, "");
      const v = clean($(spans[1]).text());
      if (k && v) specs[k] = v;
    }
  });

  const images: string[] = [];
  $("#imgTagWrapperId img, #landingImage").each((_, img) => {
    const src = $(img).attr("data-old-hires") ?? $(img).attr("src");
    if (src && /^https?:/.test(src)) images.push(src);
  });

  return {
    ok: true,
    asin,
    title,
    brand,
    bullets: dedup(bullets).slice(0, 12),
    description,
    specs,
    images: dedup(images).slice(0, 4),
  };
}

function clean(s: string | undefined | null): string {
  return (s ?? "")
    .replace(/[‎‏]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitiseAmazonDescription(raw: string | null | undefined): string | undefined {
  const cleaned = clean(raw);
  if (!cleaned) return undefined;
  // Strip CSS rule bodies ({ … }) — Amazon A+ inlines selectors with rules.
  let stripped = cleaned.replace(/\{[^{}]{0,400}\}/g, " ");
  // Strip raw selector tokens like ".aplus-v2 .container-with-background-image".
  stripped = stripped.replace(/(?:\.[a-zA-Z][\w-]*\s*)+(?=\.[a-zA-Z]|\s|$)/g, " ");
  // Strip leftover function fragments / </style> markers.
  stripped = stripped.replace(/function\s+\w+\([^)]*\)/g, " ");
  stripped = stripped.replace(/<\/?(?:script|style)[^>]*>/gi, " ");
  stripped = stripped.replace(/Produktinformation/g, " ");
  const final = clean(stripped);
  // Final guard: if it still looks CSS-y or is too short, drop it.
  if (/\.aplus|\.a-/.test(final) && final.length < 200) return undefined;
  return final.length >= 30 ? final : undefined;
}

function dedup<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** Build a single description text block from a parsed Amazon snapshot. */
export function amazonProductToText(p: AmazonProduct): string {
  const parts: string[] = [];
  if (p.title) parts.push(`Titel: ${p.title}`);
  if (p.brand) parts.push(`Marke: ${p.brand}`);
  if (p.bullets.length) parts.push("Highlights:\n- " + p.bullets.join("\n- "));
  if (p.description) parts.push(`Beschreibung: ${p.description}`);
  const specEntries = Object.entries(p.specs).slice(0, 12);
  if (specEntries.length) {
    parts.push("Technische Daten:\n" + specEntries.map(([k, v]) => `- ${k}: ${v}`).join("\n"));
  }
  return parts.join("\n\n");
}
