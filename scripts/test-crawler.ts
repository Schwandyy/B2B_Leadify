import { searchDuckDuckGo } from "../lib/research/search/duckduckgo";
import { crawlSite } from "../lib/research/crawler/siteCrawler";
import { crawlerCompanyDiscovery } from "../lib/research/crawlerProvider";

const STEP = process.argv[2] ?? "all";
const QUERY = process.argv[3] ?? "Berufsschule Elektronik NRW";

async function main() {
  if (STEP === "search" || STEP === "all") {
    console.log(`\n[1] DuckDuckGo for: ${QUERY}`);
    const hits = await searchDuckDuckGo(QUERY, { region: "DE", max: 8 });
    console.log(`    ${hits.length} hits`);
    hits.forEach((h, i) => console.log(`    ${i + 1}. ${h.title} -> ${h.url}`));
    if (STEP === "search") return;
  }

  if (STEP === "crawl" || STEP === "all") {
    const target = process.argv[4] ?? "https://www.heise.de/";
    console.log(`\n[2] Crawl single site: ${target}`);
    const site = await crawlSite(target);
    if (!site) {
      console.log("    Site unreachable.");
    } else {
      console.log("    homepage:", site.homepageUrl);
      console.log("    title:   ", site.homepageTitle);
      console.log("    imprint: ", site.imprintUrl);
      console.log("    contact: ", site.contactPageUrl);
      console.log("    company: ", site.fields.companyName);
      console.log("    address: ", site.fields.postalAddress);
      console.log("    emails:  ", site.fields.emails);
      console.log("    phones:  ", site.fields.phones);
    }
    if (STEP === "crawl") return;
  }

  if (STEP === "discover" || STEP === "all") {
    console.log(`\n[3] Provider.discover: ${QUERY}`);
    const result = await crawlerCompanyDiscovery.search({ query: QUERY, region: "DE", limit: 5 });
    console.log(`    ${result.length} companies`);
    for (const c of result) {
      console.log(`    • ${c.companyName} — ${c.website}`);
      console.log(`      email: ${c.contactEmail ?? "—"}  phone: ${c.contactPhone ?? "—"}`);
      console.log(`      city:  ${c.city ?? "—"}  country: ${c.country ?? "—"}`);
      console.log(`      sources: ${c.sources.length} (${c.sources.map((s) => s.kind).join(", ")})`);
    }
  }
}

main().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
