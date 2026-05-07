/**
 * One-Shot-Resync: gleicht Product gegen die Master-Sheet ab.
 *
 * - Existierende Produkte: name wird überschrieben mit Sheet-Wert.
 * - Fehlende AZ-Codes (in Sheet, nicht in DB): neue Product-Datensätze.
 *
 * Run: npx tsx scripts/resync-products-from-master.ts            # dry-run
 *      npx tsx scripts/resync-products-from-master.ts --apply    # schreibt
 */

import { prisma } from "../lib/db/prisma";
import { parseGoogleSheet } from "../lib/import/parser";

const APPLY = process.argv.includes("--apply");

async function main() {
  const sources = await prisma.inventorySource.findMany();
  if (sources.length === 0) {
    console.error("Keine InventorySource hinterlegt — vorher /admin/inventory einrichten.");
    process.exit(1);
  }

  let totalUpdated = 0;
  let totalUnchanged = 0;
  let totalCreated = 0;

  for (const source of sources) {
    console.log(`\n=== Organisation: ${source.organizationId} ===`);
    console.log(`Sheet: ${source.sheetUrl}`);
    console.log(`Tab:   ${source.tabName ?? "(via gid)"}`);

    const parsed = await parseGoogleSheet(source.sheetUrl, {
      sheetName: source.tabName ?? undefined,
      gid: source.gid ?? undefined,
    });

    if (!parsed.headers.includes(source.skuColumn)) {
      console.error(`  AZ-Code-Spalte "${source.skuColumn}" nicht in Sheet-Headers gefunden.`);
      continue;
    }

    // Produkt-Spalte in der Master-Sheet finden — heuristisch: erste Spalte
    // mit Header "Product" oder "Produkt", sonst Spalte C (Index 2).
    const productHeader = pickProductHeader(parsed.headers);
    if (!productHeader) {
      console.error(`  Konnte keine Produkt-Spalte erkennen. Headers: ${parsed.headers.join(", ")}`);
      continue;
    }
    console.log(`  Produkt-Spalte: "${productHeader}"`);

    // Owner für neu anzulegende Produkte: erster Admin der Org, sonst erster User.
    const owner = await prisma.user.findFirst({
      where: { organizationId: source.organizationId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true, email: true },
    });
    if (!owner) {
      console.error(`  Kein User in der Organisation — Anlegen neuer Produkte nicht möglich.`);
      continue;
    }
    console.log(`  Owner für neue Produkte: ${owner.email}`);

    const updates: { sku: string; oldName: string; newName: string; productId: string }[] = [];
    const creates: { sku: string; name: string }[] = [];
    // Deduplizieren: Sheet hat teils dieselbe AZ-SKU mehrfach (Pack-Varianten
    // mit gleicher Master-SKU). Erste Zeile gewinnt für Updates wie Creates.
    const seenSku = new Set<string>();

    for (const row of parsed.rows) {
      const sku = (row[source.skuColumn] ?? "").trim();
      const newName = (row[productHeader] ?? "").trim();
      if (!sku || !newName) continue;
      if (seenSku.has(sku)) continue;
      seenSku.add(sku);

      const product = await prisma.product.findFirst({
        where: { organizationId: source.organizationId, masterSku: sku },
        select: { id: true, name: true },
      });

      if (!product) {
        creates.push({ sku, name: newName });
        continue;
      }

      if (product.name === newName) continue;
      updates.push({ sku, oldName: product.name, newName, productId: product.id });
    }

    console.log(`  Zu aktualisieren: ${updates.length}`);
    console.log(`  Bereits korrekt:  ${parsed.rows.length - updates.length - creates.length}`);
    console.log(`  Neu anzulegen:    ${creates.length}`);

    for (const u of updates.slice(0, 10)) {
      console.log(`    [UPD] ${u.sku.padEnd(8)} "${u.oldName.slice(0, 40).padEnd(40)}" → "${u.newName.slice(0, 40)}"`);
    }
    if (updates.length > 10) console.log(`    … und ${updates.length - 10} weitere Updates`);

    for (const c of creates.slice(0, 10)) {
      console.log(`    [NEW] ${c.sku.padEnd(8)} "${c.name.slice(0, 60)}"`);
    }
    if (creates.length > 10) console.log(`    … und ${creates.length - 10} weitere Neu-Anlagen`);

    if (APPLY) {
      if (updates.length > 0) {
        for (const u of updates) {
          await prisma.product.update({
            where: { id: u.productId },
            data: { name: u.newName },
          });
        }
        console.log(`  ✓ ${updates.length} Produkte aktualisiert.`);
      }
      if (creates.length > 0) {
        for (const c of creates) {
          await prisma.product.create({
            data: {
              organizationId: source.organizationId,
              ownerId: owner.id,
              masterSku: c.sku,
              name: c.name,
              description: "",
              targetCustomerTypes: [],
              keywords: [],
              exclusions: [],
            },
          });
        }
        console.log(`  ✓ ${creates.length} neue Produkte angelegt.`);
      }
    }

    totalUpdated += updates.length;
    totalUnchanged += parsed.rows.length - updates.length - creates.length;
    totalCreated += creates.length;
  }

  console.log(`\n=== Total ===`);
  console.log(`Updates:     ${totalUpdated}${APPLY ? " (geschrieben)" : " (dry-run)"}`);
  console.log(`Neu angelegt: ${totalCreated}${APPLY ? " (geschrieben)" : " (dry-run)"}`);
  console.log(`Unverändert: ${totalUnchanged}`);
  if (!APPLY) console.log(`\nMit --apply nochmal laufen lassen, um die Änderungen tatsächlich zu schreiben.`);
}

function pickProductHeader(headers: string[]): string | null {
  const candidates = ["Product", "Produkt", "Produktname", "Name"];
  for (const candidate of candidates) {
    if (headers.includes(candidate)) return candidate;
  }
  // Fallback: Spalte C (Index 2) wenn vorhanden.
  return headers[2] ?? null;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
