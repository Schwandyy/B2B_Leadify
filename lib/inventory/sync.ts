import { prisma } from "@/lib/db/prisma";
import { parseGoogleSheet } from "@/lib/import/parser";
import type { ImportRow } from "@/lib/import/types";

export type SyncResult = {
  ok: boolean;
  rowsRead: number;
  rowsWritten: number;
  warnings: string[];
  error?: string;
};

/**
 * Liest die hinterlegte Inventory-Sheet einer Organisation und überschreibt
 * deren InventorySnapshots komplett. Unbekannte Zeilen werden übersprungen,
 * unparsbare Bestandszahlen ebenfalls (mit Warnung im Log).
 */
export async function syncInventory(organizationId: string): Promise<SyncResult> {
  const source = await prisma.inventorySource.findUnique({ where: { organizationId } });
  if (!source) {
    return {
      ok: false,
      rowsRead: 0,
      rowsWritten: 0,
      warnings: [],
      error: "Keine Inventory-Quelle hinterlegt.",
    };
  }

  let parsed;
  try {
    parsed = await parseGoogleSheet(source.sheetUrl, {
      headerRow: source.headerRow ?? undefined,
      gid: source.gid ?? undefined,
      sheetName: source.tabName ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sheet konnte nicht gelesen werden.";
    await prisma.inventorySource.update({
      where: { organizationId },
      data: { lastError: message, lastSyncedAt: new Date() },
    });
    return { ok: false, rowsRead: 0, rowsWritten: 0, warnings: [], error: message };
  }

  const skuColumn = source.skuColumn;
  const stockColumn = source.stockColumn;
  if (!parsed.headers.includes(skuColumn) || !parsed.headers.includes(stockColumn)) {
    const message = `Spalte fehlt: ${!parsed.headers.includes(skuColumn) ? skuColumn : stockColumn}. Vorhandene Spalten: ${parsed.headers.join(", ")}`;
    await prisma.inventorySource.update({
      where: { organizationId },
      data: { lastError: message, lastSyncedAt: new Date(), lastRowCount: parsed.rows.length },
    });
    return {
      ok: false,
      rowsRead: parsed.rows.length,
      rowsWritten: 0,
      warnings: parsed.warnings,
      error: message,
    };
  }

  const records = buildRecords(parsed.rows, skuColumn, stockColumn, organizationId);

  await prisma.$transaction([
    prisma.inventorySnapshot.deleteMany({ where: { organizationId } }),
    prisma.inventorySnapshot.createMany({ data: records.valid, skipDuplicates: true }),
    prisma.inventorySource.update({
      where: { organizationId },
      data: {
        lastError: null,
        lastSyncedAt: new Date(),
        lastRowCount: parsed.rows.length,
      },
    }),
  ]);

  const warnings = [...parsed.warnings];
  if (records.skipped > 0) {
    warnings.push(`${records.skipped} Zeile(n) übersprungen (leere SKU oder ungültiger Bestand).`);
  }

  return {
    ok: true,
    rowsRead: parsed.rows.length,
    rowsWritten: records.valid.length,
    warnings,
  };
}

function buildRecords(
  rows: ImportRow[],
  skuColumn: string,
  stockColumn: string,
  organizationId: string,
) {
  const seen = new Set<string>();
  const valid: { organizationId: string; masterSku: string; availableStock: number }[] = [];
  let skipped = 0;
  for (const row of rows) {
    const sku = (row[skuColumn] ?? "").trim();
    const stockRaw = (row[stockColumn] ?? "").trim();
    if (!sku) {
      skipped += 1;
      continue;
    }
    const stock = parseStock(stockRaw);
    if (stock === null) {
      skipped += 1;
      continue;
    }
    // Erste Zeile für eine SKU gewinnt — Duplikate ignorieren wir bewusst,
    // damit die Sheet als Single-Source-of-Truth gilt.
    const key = sku.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push({ organizationId, masterSku: sku, availableStock: stock });
  }
  return { valid, skipped };
}

// Postgres INT4-Maximum. Werte darüber sind in einer Stock-Spalte fast
// sicher Parse-Fehler (z. B. Geldbeträge mit aggressiv entfernten Trennern).
const MAX_STOCK = 2_000_000_000;

function parseStock(value: string): number | null {
  if (!value) return null;
  // Währungs-Symbole und Whitespace entfernen.
  let s = value.replace(/[\s€$£¥%]/g, "").trim();
  if (!s) return null;

  // Klassische Geldbetrag-Muster (Dezimalstellen) ablehnen — kein Bestand.
  // "270,00", "1.234,56", "1,234.56", "30.99"
  if (/^-?\d{1,3}(?:[.,]\d{3})*[.,]\d{1,2}$/.test(s)) return null;
  if (/^-?\d+[.,]\d{1,2}$/.test(s)) return null;

  // Tausender-Trenner mit klarem 3er-Muster auflösen ("1.234.567", "1,234,567").
  if (/^-?\d{1,3}(?:\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else if (/^-?\d{1,3}(?:,\d{3})+$/.test(s)) s = s.replace(/,/g, "");

  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > MAX_STOCK) return null;
  return Math.trunc(n);
}
