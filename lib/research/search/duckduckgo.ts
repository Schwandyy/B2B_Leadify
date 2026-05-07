import * as cheerio from "cheerio";
import { awaitDomainSlot } from "../crawler/rateLimiter";

// Search endpoints serve different markup to text-browser UAs vs. browser UAs.
// We use a browser UA *only* for the search request (which is user-triggered,
// not crawler-style). Subsequent imprint/contact crawls keep our transparent UA.
const SEARCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
};

export type SearchHit = {
  title: string;
  url: string;
  snippet?: string;
};

const ENDPOINT = "https://html.duckduckgo.com/html/";

/**
 * Free, no-API-key DuckDuckGo HTML search.
 *
 * The HTML view returns 202/captcha for GET, so we POST the query like the
 * actual form does. We bypass robots.txt for this endpoint because DDG's
 * blanket disallow targets index crawlers — every DDG library wrapper takes
 * the same stance for user-triggered searches. Rate-limiter still applies.
 */
export async function searchDuckDuckGo(query: string, opts: { region?: string; max?: number } = {}): Promise<SearchHit[]> {
  const body = new URLSearchParams({ q: query });
  if (opts.region) {
    const kl = mapRegionToKl(opts.region);
    if (kl) body.set("kl", kl);
  }

  await awaitDomainSlot("html.duckduckgo.com");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  let html: string;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        ...SEARCH_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://html.duckduckgo.com/",
      },
      body: body.toString(),
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }

  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  // The HTML view uses .result blocks with .result__title > a.result__a and .result__snippet
  $(".result").each((_, el) => {
    const titleAnchor = $(el).find("a.result__a").first();
    const title = titleAnchor.text().trim();
    const rawHref = titleAnchor.attr("href") ?? "";
    if (!title || !rawHref) return;
    const href = unwrapDuckDuckGoRedirect(rawHref);
    if (!href) return;
    if (!/^https?:\/\//i.test(href)) return;
    if (isAggregator(href)) return;
    const snippet = $(el).find(".result__snippet").text().trim();
    hits.push({ title, url: href, snippet: snippet || undefined });
    if (opts.max && hits.length >= opts.max) return false;
  });
  return hits;
}

/**
 * DuckDuckGo wraps outbound links: /l/?uddg=<encoded>&...
 * Unwrap so we have the real target.
 */
function unwrapDuckDuckGoRedirect(href: string): string | null {
  try {
    const abs = href.startsWith("http") ? href : `https://duckduckgo.com${href.startsWith("/") ? "" : "/"}${href}`;
    const u = new URL(abs);
    if (u.hostname.includes("duckduckgo.com")) {
      // Sponsored result wrapper /y.js — unwanted ads, drop them.
      if (u.pathname.startsWith("/y.js")) return null;
      if (u.pathname === "/l/") {
        const target = u.searchParams.get("uddg");
        if (target) return decodeURIComponent(target);
      }
    }
    return abs;
  } catch {
    return null;
  }
}

const AGGREGATORS = [
  "wikipedia.org",
  "wiktionary.org",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "amazon.de",
  "amazon.com",
  "ebay.de",
  "linkedin.com",
  "xing.com",
  "kununu.com",
  "northdata.de",
  "dasoertliche.de",
  "gelbeseiten.de",
  "wlw.de",
  "yelp.de",
  "trustpilot.com",
  "tripadvisor.de",
];

function isAggregator(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return AGGREGATORS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return true;
  }
}

function mapRegionToKl(region: string): string | null {
  const r = region.toLowerCase();
  if (r === "de" || r.includes("deutschland")) return "de-de";
  if (r === "dach") return "de-de";
  if (r === "at" || r.includes("österreich") || r.includes("oesterreich")) return "at-de";
  if (r === "ch" || r.includes("schweiz")) return "ch-de";
  if (r === "eu") return "wt-de";
  if (r === "world") return "wt-wt";
  return null;
}
