import * as cheerio from "cheerio";

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1_000_000; // 1 MB cap per page
const USER_AGENT = "Product2LeadAI-Importer/0.1 (+https://product2lead.example)";

export type EnrichmentResult = {
  url: string;
  ok: boolean;
  status?: number;
  title?: string;
  metaDescription?: string;
  h1?: string;
  bullets?: string[];
  text?: string;
  error?: string;
};

/**
 * Fetch a product page and pull out the parts most useful for AI analysis:
 * <title>, meta description, h1, the first few list bullets, and the
 * remaining body text (capped). Best-effort — never throws.
 */
export async function enrichUrl(url: string): Promise<EnrichmentResult> {
  if (!isAllowed(url)) {
    return { url, ok: false, error: "URL nicht erlaubt (kein http(s))." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
      },
    });
    if (!res.ok) {
      return { url, ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) {
      return { url, ok: false, status: res.status, error: `Kein HTML (${ct})` };
    }
    const html = await readLimited(res, MAX_BYTES);
    return extract(url, html, res.status);
  } catch (err) {
    return { url, ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Combined enrichment text — what we'd append to a product description.
 */
export function enrichmentToText(e: EnrichmentResult): string {
  if (!e.ok) return "";
  const parts: string[] = [];
  if (e.title) parts.push(`Titel: ${e.title}`);
  if (e.metaDescription) parts.push(`Meta: ${e.metaDescription}`);
  if (e.h1 && e.h1 !== e.title) parts.push(`H1: ${e.h1}`);
  if (e.bullets && e.bullets.length) parts.push(`Highlights: ${e.bullets.join(" · ")}`);
  if (e.text) parts.push(`Text: ${e.text}`);
  return parts.join("\n");
}

function isAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    // Block obvious local/private targets to avoid SSRF
    const host = u.hostname;
    if (host === "localhost" || host.endsWith(".local")) return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    if (host === "0.0.0.0" || host === "::1") return false;
    return true;
  } catch {
    return false;
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8");
  let received = 0;
  let out = "";
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (received >= maxBytes) break;
  }
  out += decoder.decode();
  return out;
}

function extract(url: string, html: string, status: number): EnrichmentResult {
  const $ = cheerio.load(html);
  // Drop noise
  $("script, style, noscript, svg, iframe, header, footer, nav").remove();

  const title = $("head > title").first().text().trim() || undefined;
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    undefined;
  const h1 = $("h1").first().text().trim() || undefined;

  const bullets: string[] = [];
  $("ul li, ol li").each((_, el) => {
    if (bullets.length >= 8) return;
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length >= 8 && t.length <= 200) bullets.push(t);
  });

  const main = $("main, [role='main'], article, #content, .product, .product-detail").first();
  const body = (main.length ? main.text() : $("body").text())
    .replace(/\s+/g, " ")
    .trim();
  const text = body.slice(0, 1500);

  return {
    url,
    ok: true,
    status,
    title,
    metaDescription,
    h1,
    bullets: bullets.length ? bullets : undefined,
    text: text || undefined,
  };
}
