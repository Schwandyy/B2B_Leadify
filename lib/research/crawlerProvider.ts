import type { CompanyDiscoveryProvider, DiscoveredCompany } from "./types";
import { searchDuckDuckGo } from "./search/duckduckgo";
import { crawlSite } from "./crawler/siteCrawler";

/**
 * Live CompanyDiscoveryProvider that finds B2B candidates without any
 * paid API:
 *  1. Search the web (DuckDuckGo HTML, no key) for the query.
 *  2. Group hits by eTLD+1 — one company per domain, not per page.
 *  3. Crawl each domain politely (rate-limited, robots.txt) for the
 *     impressum/contact pages.
 *  4. Filter to generic-only emails (info@, vertrieb@ …) for DSGVO compliance.
 */
export const crawlerCompanyDiscovery: CompanyDiscoveryProvider = {
  async search({ query, region, limit = 6 }) {
    const hits = await searchDuckDuckGo(query, { region: region ?? undefined, max: 30 });
    if (hits.length === 0) return [];

    const byDomain = new Map<string, { domain: string; first: typeof hits[number]; snippets: string[] }>();
    for (const hit of hits) {
      let host: string;
      try {
        host = new URL(hit.url).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        continue;
      }
      // eTLD+1 (cheap heuristic — picks last 2 segments)
      const parts = host.split(".");
      const etld1 = parts.length >= 2 ? parts.slice(-2).join(".") : host;
      const existing = byDomain.get(etld1);
      if (existing) {
        if (hit.snippet) existing.snippets.push(hit.snippet);
      } else {
        byDomain.set(etld1, {
          domain: etld1,
          first: hit,
          snippets: hit.snippet ? [hit.snippet] : [],
        });
      }
    }

    const domains = Array.from(byDomain.values()).slice(0, Math.max(limit * 2, 10));
    const results: DiscoveredCompany[] = [];

    for (const d of domains) {
      if (results.length >= limit) break;
      const root = `https://${d.domain}/`;
      try {
        const site = await crawlSite(root);
        if (!site) continue;
        const company = toDiscoveredCompany(d, site);
        if (!company) continue;
        results.push(company);
      } catch {
        // Best-effort — skip on crawl failure.
        continue;
      }
    }
    return results;
  },
};

function toDiscoveredCompany(
  source: { domain: string; first: { title: string; url: string; snippet?: string }; snippets: string[] },
  site: NonNullable<Awaited<ReturnType<typeof crawlSite>>>,
): DiscoveredCompany | null {
  const fields = site.fields;
  const fallbackName = source.first.title.split(/[—–|·:]/)[0].trim();

  // Need at least one signal of contact-ability — otherwise this is noise.
  const hasSignal =
    fields.emails.length > 0 ||
    fields.phones.length > 0 ||
    Boolean(site.imprintUrl) ||
    Boolean(site.contactPageUrl);
  if (!hasSignal) return null;

  const description =
    site.homepageDescription ??
    source.first.snippet ??
    source.snippets[0] ??
    "";

  const sources: DiscoveredCompany["sources"] = [
    { url: site.homepageUrl, kind: "website", excerpt: description?.slice(0, 220) },
  ];
  if (site.imprintUrl) sources.push({ url: site.imprintUrl, kind: "imprint" });
  if (site.contactPageUrl) sources.push({ url: site.contactPageUrl, kind: "contact" });

  return {
    companyName: fields.companyName ?? fallbackName,
    website: site.homepageUrl,
    industry: undefined, // industry classification is a separate step, not a guess from the page
    city: fields.city,
    country: fields.country,
    description: description || undefined,
    productsFound: [],
    contactEmail: fields.emails[0],
    contactPhone: fields.phones[0],
    contactPageUrl: site.contactPageUrl ?? undefined,
    imprintUrl: site.imprintUrl ?? undefined,
    contactPerson: undefined, // intentionally not extracted — DSGVO
    contactRole: undefined,
    sources,
  };
}
