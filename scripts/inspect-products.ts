import { prisma } from "../lib/db/prisma";

async function main() {
  const products = await prisma.product.findMany({
    orderBy: [{ organizationId: "asc" }, { masterSku: "asc" }, { name: "asc" }],
    select: {
      id: true,
      organizationId: true,
      masterSku: true,
      name: true,
      productUrl: true,
      category: true,
      keywords: true,
      priceRangeMin: true,
      priceRangeMax: true,
      variants: true,
      _count: { select: { leads: true, searchRuns: true } },
      createdAt: true,
    },
  });

  console.log(`Total products: ${products.length}\n`);
  for (const p of products) {
    const variantCount = Array.isArray(p.variants) ? p.variants.length : 0;
    console.log(
      `${p.id}  org=${p.organizationId.slice(0, 6)}  masterSku=${JSON.stringify(p.masterSku)}  ` +
        `leads=${p._count.leads} searchRuns=${p._count.searchRuns} variants=${variantCount}\n` +
        `   name: ${p.name}\n` +
        `   url:  ${p.productUrl ?? "—"}\n` +
        `   cat:  ${p.category ?? "—"}  price: ${p.priceRangeMin ?? "?"}-${p.priceRangeMax ?? "?"}\n` +
        `   keywords: ${p.keywords.slice(0, 4).join(", ")}\n`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
