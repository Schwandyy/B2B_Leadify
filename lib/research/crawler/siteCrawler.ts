import * as cheerio from "cheerio";
import { politeGet } from "./fetcher";
import { parseImprintHtml, type ImprintFields } from "./imprintParser";

const COMMON_PATHS = [
  "/impressum",
  "/imprint",
  "/legal-notice",
  "/kontakt",
  "/contact",
  "/contact-us",
  "/ueber-uns",
  "/about",
  "/about-us",
  "/unternehmen",
  "/firmenprofil",
  "/datenschutz",
];

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

  // Visit at most two extra pages to keep crawls fast and polite.
  const tried = new Set<string>([home.finalUrl]);
  let visits = 0;
  for (const link of candidateLinks) {
    if (visits >= 2) break;
    if (tried.has(link.url)) continue;
    tried.add(link.url);

    const page = await politeGet(link.url);
    if (!page.ok) continue;
    visits += 1;

    const parsed = parseImprintHtml(page.html);
    mergeFields(fields, parsed);

    if (link.kind === "imprint" && !imprintUrl) imprintUrl = page.finalUrl;
    if (link.kind === "contact" && !contactPageUrl) contactPageUrl = page.finalUrl;
  }

  // If neither imprint nor contact was found via discovered links, try common paths directly.
  if (!imprintUrl || !contactPageUrl) {
    for (const path of COMMON_PATHS) {
      if (visits >= 2) break;
      const url = absolutiseUrl(path, home.finalUrl);
      if (!url || tried.has(url)) continue;
      tried.add(url);
      const page = await politeGet(url);
      if (!page.ok) continue;
      visits += 1;
      const parsed = parseImprintHtml(page.html);
      mergeFields(fields, parsed);
      if (path.includes("impressum") || path.includes("imprint") || path.includes("legal")) {
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
