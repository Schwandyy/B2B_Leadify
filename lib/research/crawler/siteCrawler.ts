import * as cheerio from "cheerio";
import { politeGet } from "./fetcher";
import { parseImprintHtml, type ImprintFields } from "./imprintParser";

const COMMON_PATHS = [
  "/impressum",
  "/impressum/",
  "/imprint",
  "/legal-notice",
  "/pages/impressum",
  "/pages/imprint",
  "/pages/legal-notice",
  // Shopify-Standard-URLs
  "/policies/legal-notice",
  "/policies/contact-information",
  "/kontakt",
  "/contact",
  "/contact-us",
  "/pages/kontakt",
  "/pages/contact",
  "/ueber-uns",
  "/about",
  "/about-us",
  "/unternehmen",
  "/firmenprofil",
];

// Typische Slug-Bestandteile, die ein Treffer NICHT sein darf — vermeidet
// dass der Crawler Produktdetail- oder Blogseiten als Contact-Page einstuft.
const SLUG_NEGATIVE = /(produkt|product|blog|post|article|kategorie|category|sortiment|temperaturmessung|all-in-one|ruckruffunktion|messenger|button|how-?to|tutorial)/i;
// Maximale Tiefe einer Contact/Impressum-Seite. /pages/kontakt = 2 Segmente OK,
// /bauelemente/buchsen-stecker/kontakte = 3 nicht.
const MAX_PATH_SEGMENTS = 2;
// Visit-Budget — je größer, desto besser die Trefferquote, aber langsamer.
const MAX_VISITS = 4;

const LINK_KEYWORDS = [
  "impressum",
  "imprint",
  "legal notice",
  "kontakt",
  "contact",
  "über uns",
  "ueber uns",
  "about us",
  "about",
  "firmenprofil",
  "unternehmen",
];

type Site = {
  homepageUrl: string;
  homepageTitle?: string;
  homepageDescription?: string;
  imprintUrl?: string;
  contactPageUrl?: string;
  fields: ImprintFields;
};

/**
 * Crawl a single site root: home → impressum/contact pages → impressum parser.
 * Always best-effort. Returns undefined when the homepage itself isn't reachable.
 */
export async function crawlSite(rootUrl: string): Promise<Site | undefined> {
  const home = await politeGet(rootUrl);
  if (!home.ok) return undefined;

  const $ = cheerio.load(home.html);
  const homepageTitle = $("head > title").text().trim() || undefined;
  const homepageDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    undefined;

  const candidateLinks = collectLinkCandidates($, home.finalUrl);

  let imprintUrl: string | undefined;
  let contactPageUrl: string | undefined;
  const fields: ImprintFields = {
    emails: [],
    phones: [],
  };

  // Visit-Budget aufteilen: erst gefundene Links (gefiltert), dann
  // Common-Paths als Fallback. Anders als zuvor wird Common-Paths IMMER
  // versucht, solange noch Budget übrig ist — auch wenn schon ein
  // Impressum/Contact gefunden wurde, aber Email/Phone noch leer sind.
  const tried = new Set<string>([home.finalUrl]);
  let visits = 0;
  for (const link of candidateLinks) {
    if (visits >= MAX_VISITS) break;
    if (tried.has(link.url)) continue;
    if (!isPlausibleContactPath(link.url, home.finalUrl)) continue;
    tried.add(link.url);

    const page = await politeGet(link.url);
    if (!page.ok) continue;
    visits += 1;

    const parsed = parseImprintHtml(page.html);
    mergeFields(fields, parsed);

    // Auch hier den Redirect-Check: /kontakt → /kontaktlose-...-blog-post.
    if (!isPlausibleContactPath(page.finalUrl, home.finalUrl)) continue;
    if (link.kind === "imprint" && !imprintUrl) imprintUrl = page.finalUrl;
    if (link.kind === "contact" && !contactPageUrl) contactPageUrl = page.finalUrl;
  }

  // Common-Paths immer als Fallback — auch wenn Impressum gefunden wurde,
  // aber noch keine Email/Phone extrahiert. Hilft besonders bei Shopify-Sites
  // (/policies/...) oder wenn Homepage-Links auf Produktseiten verlinken.
  const needMoreData = fields.emails.length === 0 && fields.phones.length === 0;
  if (needMoreData || !imprintUrl) {
    for (const path of COMMON_PATHS) {
      if (visits >= MAX_VISITS) break;
      const url = absolutiseUrl(path, home.finalUrl);
      if (!url || tried.has(url)) continue;
      tried.add(url);
      const page = await politeGet(url);
      if (!page.ok) continue;
      visits += 1;
      // WordPress/SEO-Trick: /kontakt redirected oft auf einen Blog-Post mit
      // "kontakt" im Slug. Wenn die finale URL nicht mehr nach Contact/
      // Impressum aussieht, Daten parsen aber URL nicht zuweisen.
      const redirectedAway = !isPlausibleContactPath(page.finalUrl, home.finalUrl);
      const parsed = parseImprintHtml(page.html);
      mergeFields(fields, parsed);
      if (redirectedAway) continue;
      if (/(impressum|imprint|legal)/.test(path)) {
        imprintUrl ??= page.finalUrl;
      } else {
        contactPageUrl ??= page.finalUrl;
      }
    }
  }

  // Last-resort: also scan the homepage itself.
  if (fields.emails.length === 0 && fields.phones.length === 0) {
    const parsed = parseImprintHtml(home.html);
    mergeFields(fields, parsed);
  }

  return {
    homepageUrl: home.finalUrl,
    homepageTitle,
    homepageDescription,
    imprintUrl,
    contactPageUrl,
    fields,
  };
}

type LinkKind = "imprint" | "contact" | "about";
type Link = { url: string; kind: LinkKind; text: string };

function collectLinkCandidates($: cheerio.CheerioAPI, baseUrl: string): Link[] {
  const out: Link[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().toLowerCase().trim();
    if (!href || !text) return;
    const lower = `${href} ${text}`.toLowerCase();
    if (!LINK_KEYWORDS.some((kw) => lower.includes(kw))) return;
    const abs = absolutiseUrl(href, baseUrl);
    if (!abs) return;
    let kind: LinkKind = "about";
    if (lower.includes("impressum") || lower.includes("imprint") || lower.includes("legal")) kind = "imprint";
    else if (lower.includes("kontakt") || lower.includes("contact")) kind = "contact";
    out.push({ url: abs, kind, text });
  });
  // Imprint > contact > about precedence.
  return out.sort((a, b) => weight(a.kind) - weight(b.kind));
}

function weight(kind: LinkKind): number {
  if (kind === "imprint") return 0;
  if (kind === "contact") return 1;
  return 2;
}

/**
 * Filtert URLs, die zu kontakt/contact-Begriffen passen, aber offensichtlich
 * Produkt- oder Blog-Seiten sind. Erwartet eine flache URL mit max. 2
 * Pfad-Segmenten, deren letztes Segment ein klares Contact/Impressum-Wort
 * ist — kein Anhängsel wie "kontaktlose-temperaturmessung".
 */
function isPlausibleContactPath(url: string, baseUrl: string): boolean {
  try {
    const u = new URL(url);
    const base = new URL(baseUrl);
    if (u.host !== base.host) return false;
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length === 0 || segments.length > MAX_PATH_SEGMENTS) return false;
    if (SLUG_NEGATIVE.test(u.pathname)) return false;
    const last = segments[segments.length - 1].toLowerCase();
    // Strenger Match: nur exakte Begriffe oder mit kurzem Suffix wie "-en".
    // Vermeidet "impressumspflicht-...", "kontaktlose-...", "contact-us-all-in-one-..."
    return /^(impressum|imprint|kontakt|contact|contact-us|contact-information|legal-notice|legal_notice|legal|legalnotice|firmenprofil|unternehmen)(-(en|de))?$/.test(
      last,
    );
  } catch {
    return false;
  }
}

function absolutiseUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function mergeFields(target: ImprintFields, extra: ImprintFields) {
  for (const e of extra.emails) {
    if (!target.emails.includes(e)) target.emails.push(e);
  }
  for (const p of extra.phones) {
    if (!target.phones.includes(p)) target.phones.push(p);
  }
  target.postalAddress ??= extra.postalAddress;
  target.city ??= extra.city;
  target.country ??= extra.country;
  target.companyName ??= extra.companyName;
  target.zipCode ??= extra.zipCode;
}
