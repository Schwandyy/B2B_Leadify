import { enrichProduct } from "../lib/import/productEnrichment";

async function main() {
  const cases = [
    { name: "0,96 Zoll I2C OLED Display", productUrl: "https://www.amazon.de/dp/B074NBCJT1" },
    { name: "Arduino Starter Kit", productUrl: null },
    { name: "16-Relais Modul 5V", productUrl: "https://www.amazon.de/dp/B07BJBMWQS" },
  ];
  for (const c of cases) {
    console.log(`\n=== ${c.name} (${c.productUrl ?? "no URL"}) ===`);
    const r = await enrichProduct(c);
    console.log("tried:", r.tried);
    if (!r.ok) {
      console.log("FAIL:", r.reason);
      continue;
    }
    console.log("source:", r.snapshot.source, "url:", r.snapshot.url);
    console.log("title:", r.snapshot.title);
    console.log("brand:", r.snapshot.brand);
    console.log("bullets:", r.snapshot.bullets.slice(0, 3));
    console.log("description (first 200):", r.snapshot.description?.slice(0, 200));
    console.log("text length:", r.snapshot.text.length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
