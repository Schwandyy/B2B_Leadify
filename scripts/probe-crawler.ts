import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

import { politeGet } from "../lib/research/crawler/fetcher";
import { crawlSite } from "../lib/research/crawler/siteCrawler";
import { parseImprintHtml } from "../lib/research/crawler/imprintParser";

async function main() {
  const sites = process.argv.slice(2);
  if (sites.length === 0) {
    console.error("usage: tsx scripts/probe-crawler.ts <url> [url …]");
    process.exit(1);
  }

  for (const site of sites) {
  console.log(`\n=== ${site} ===`);
  const home = await politeGet(site);
  if (!home.ok) {
    console.log(`  Homepage fetch failed: ${home.reason}${home.status ? ` (HTTP ${home.status})` : ""}`);
    continue;
  }
  console.log(`  Homepage: ${home.finalUrl} (${home.html.length} bytes)`);
  // quick parse on homepage itself
  const homeFields = parseImprintHtml(home.html);
  console.log(`  Homepage parse: emails=${homeFields.emails.length}, phones=${homeFields.phones.length}`);
  if (homeFields.emails.length) console.log(`    [home] emails: ${homeFields.emails.slice(0, 3).join(", ")}`);

  const result = await crawlSite(site);
  if (!result) {
    console.log("  Crawl returned undefined");
    continue;
  }
  console.log(`  imprintUrl:  ${result.imprintUrl ?? "—"}`);
  console.log(`  contactPage: ${result.contactPageUrl ?? "—"}`);
  console.log(`  Final fields: emails=${result.fields.emails.length}, phones=${result.fields.phones.length}`);
  if (result.fields.emails.length) console.log(`    emails: ${result.fields.emails.slice(0, 5).join(", ")}`);
  if (result.fields.phones.length) console.log(`    phones: ${result.fields.phones.slice(0, 5).join(", ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
