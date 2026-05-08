"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { syncInventory } from "@/lib/inventory/sync";
import { parseGoogleSheet, parseSheetIds } from "@/lib/import/parser";
import { suggestColumnMapping, extractTabName } from "@/lib/inventory/ai-mapping";

export type ConnectAndSyncInput = {
  sheetUrl: string;
  description?: string;
};

export type ConnectAndSyncResult =
  | {
      ok: true;
      rowsRead: number;
      rowsWritten: number;
      mapping: { skuColumn: string; stockColumn: string; reasoning: string };
      tab?: string;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      headers?: string[];
      tab?: string;
      hint?: string;
    };

/**
 * One-Shot-Verbinden: parst URL → lädt Sheet → KI matcht Spalten →
 * speichert InventorySource → führt Sync aus. Alles oder nichts.
 * Der User sieht nur Erfolg + Zahlen oder einen klaren Fehler.
 */
export async function connectAndSync(input: ConnectAndSyncInput): Promise<ConnectAndSyncResult> {
  const user = await requireAdmin();
  const url = input.sheetUrl.trim();
  if (!url) return { ok: false, error: "Bitte die Google-Sheets-URL eintragen." };

  const ids = parseSheetIds(url);
  if (!ids) {
    return {
      ok: false,
      error:
        "Das sieht nicht wie eine Google-Sheets-URL aus. Bitte den vollständigen Link aus der Browser-Adresszeile kopieren.",
    };
  }
  const description = input.description?.trim() || undefined;
  const tabName = description ? extractTabName(description) : null;

  let parsed;
  try {
    parsed = await parseGoogleSheet(url, { sheetName: tabName ?? undefined });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Sheet konnte nicht gelesen werden.",
    };
  }

  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return {
      ok: false,
      error: "Der geladene Tab ist leer.",
      tab: parsed.sheetName,
      hint: "Stelle sicher, dass du die URL kopierst, während der richtige Tab in Google Sheets aktiv ist (die URL ändert sich beim Klick auf einen Tab).",
    };
  }

  const suggestion = await suggestColumnMapping({
    headers: parsed.headers,
    sampleRows: parsed.rows.slice(0, 5),
    description,
  });

  if (!suggestion.skuColumn || !suggestion.stockColumn) {
    return {
      ok: false,
      error:
        suggestion.confidence === "low"
          ? "Konnte AZ-Code- und Bestand-Spalte nicht sicher zuordnen."
          : "Eine der beiden Spalten konnte nicht gefunden werden.",
      headers: parsed.headers,
      tab: parsed.sheetName,
      hint: looksLikeWrongTab(parsed.headers)
        ? "Der geladene Tab sieht nicht nach Lagerbestand aus (Spalten wie Monatsnamen). Öffne in Google Sheets den richtigen Tab und kopiere die URL erneut — die gid am Ende der URL ändert sich pro Tab."
        : "Beschreibe in der Beschreibung genauer, welche Spalten du brauchst — z. B. die Spalte mit Werten wie AZ001 für den AZ-Code und die Spalte mit ganzen Zahlen für den Bestand.",
    };
  }

  // Persistieren + sofort syncen. Tab-Name wird mitgespeichert; beim
  // Re-Sync wird damit zuverlässig der richtige Tab geladen — unabhängig
  // von der gid-Stale-Falle in der ursprünglichen URL.
  await prisma.inventorySource.upsert({
    where: { organizationId: user.organizationId },
    create: {
      organizationId: user.organizationId,
      sheetUrl: url,
      gid: ids.gid,
      tabName,
      headerRow: null,
      description: description ?? null,
      skuColumn: suggestion.skuColumn,
      stockColumn: suggestion.stockColumn,
    },
    update: {
      sheetUrl: url,
      gid: ids.gid,
      tabName,
      headerRow: null,
      description: description ?? null,
      skuColumn: suggestion.skuColumn,
      stockColumn: suggestion.stockColumn,
    },
  });

  const sync = await syncInventory(user.organizationId);

  revalidatePath("/admin/inventory");
  revalidatePath("/products");

  if (!sync.ok) {
    return {
      ok: false,
      error: sync.error ?? "Sync fehlgeschlagen.",
      headers: parsed.headers,
      tab: parsed.sheetName,
    };
  }

  return {
    ok: true,
    rowsRead: sync.rowsRead,
    rowsWritten: sync.rowsWritten,
    mapping: {
      skuColumn: suggestion.skuColumn,
      stockColumn: suggestion.stockColumn,
      reasoning: suggestion.reasoning,
    },
    tab: parsed.sheetName,
    warnings: [...suggestion.warnings, ...sync.warnings],
  };
}

export type SyncActionResult =
  | { ok: true; rowsRead: number; rowsWritten: number; warnings: string[] }
  | { ok: false; error: string; warnings?: string[] };

export async function runInventorySync(): Promise<SyncActionResult> {
  const user = await requireAdmin();
  const result = await syncInventory(user.organizationId);

  revalidatePath("/admin/inventory");
  revalidatePath("/products");

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Sync fehlgeschlagen.", warnings: result.warnings };
  }
  return {
    ok: true,
    rowsRead: result.rowsRead,
    rowsWritten: result.rowsWritten,
    warnings: result.warnings,
  };
}

export type ResyncProductsResult =
  | { ok: true; updated: number; created: number; unchanged: number }
  | { ok: false; error: string };

/**
 * Gleicht Produkt-Stammdaten gegen die Master-Sheet ab. Aktualisiert für
 * existierende Produkte name + productUrl; leert variants, wenn der neue
 * Master-ASIN nicht mehr in den vorhandenen Pack-ASINs vorkommt (= alte
 * Pack-Varianten gehören zu einem anderen Produkt). Fehlende AZ-Codes
 * werden als neue Produkte angelegt. Bestände bleiben automatisch
 * zugeordnet — InventorySnapshot ist über masterSku-String verknüpft.
 */
export async function resyncProductsFromMaster(): Promise<ResyncProductsResult> {
  const user = await requireAdmin();
  const source = await prisma.inventorySource.findUnique({
    where: { organizationId: user.organizationId },
  });
  if (!source) {
    return { ok: false, error: "Keine Sheet-Quelle hinterlegt — vorher oben verbinden." };
  }

  let parsed;
  try {
    parsed = await parseGoogleSheet(source.sheetUrl, {
      sheetName: source.tabName ?? undefined,
      gid: source.gid ?? undefined,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Sheet konnte nicht gelesen werden.",
    };
  }

  const productHeader = pickProductHeader(parsed.headers);
  if (!productHeader) {
    return {
      ok: false,
      error: `Konnte keine Produkt-Spalte in der Sheet erkennen. Headers: ${parsed.headers.join(", ")}`,
    };
  }
  const linkHeader = pickLinkHeader(parsed.headers);
  const asinHeader = pickAsinHeader(parsed.headers);

  const owner = await prisma.user.findFirst({
    where: { organizationId: user.organizationId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!owner) return { ok: false, error: "Kein User in der Organisation gefunden." };

  let updated = 0;
  let created = 0;
  let unchanged = 0;
  const seen = new Set<string>();

  for (const row of parsed.rows) {
    const sku = (row[source.skuColumn] ?? "").trim();
    const newName = (row[productHeader] ?? "").trim();
    if (!sku || !newName || seen.has(sku)) continue;
    seen.add(sku);

    const newUrl = normalizeUrl(linkHeader ? row[linkHeader] : "", asinHeader ? row[asinHeader] : "");

    const existing = await prisma.product.findFirst({
      where: { organizationId: user.organizationId, masterSku: sku },
      select: { id: true, name: true, productUrl: true, variants: true },
    });

    if (!existing) {
      await prisma.product.create({
        data: {
          organizationId: user.organizationId,
          ownerId: owner.id,
          masterSku: sku,
          name: newName,
          productUrl: newUrl ?? undefined,
          description: "",
          targetCustomerTypes: [],
          keywords: [],
          exclusions: [],
        },
      });
      created += 1;
      continue;
    }

    const nameChanged = existing.name !== newName;
    const urlChanged = newUrl !== null && existing.productUrl !== newUrl;
    const variantsStale = newUrl ? variantsAreStale(existing.variants, newUrl) : false;
    if (!nameChanged && !urlChanged && !variantsStale) {
      unchanged += 1;
      continue;
    }
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(nameChanged ? { name: newName } : {}),
        ...(newUrl !== null && urlChanged ? { productUrl: newUrl } : {}),
        ...(nameChanged || variantsStale ? { variants: Prisma.JsonNull } : {}),
      },
    });
    updated += 1;
  }

  revalidatePath("/products");
  revalidatePath("/admin/inventory");
  return { ok: true, updated, created, unchanged };
}

function pickProductHeader(headers: string[]): string | null {
  const candidates = ["Product", "Produkt", "Produktname", "Name"];
  for (const candidate of candidates) {
    if (headers.includes(candidate)) return candidate;
  }
  return headers[2] ?? null;
}

function pickLinkHeader(headers: string[]): string | null {
  for (const candidate of ["Link", "URL", "Url"]) {
    if (headers.includes(candidate)) return candidate;
  }
  return null;
}

function pickAsinHeader(headers: string[]): string | null {
  for (const candidate of ["First ASIN", "ASIN"]) {
    if (headers.includes(candidate)) return candidate;
  }
  return null;
}

function normalizeUrl(linkRaw: string | undefined, asinRaw: string | undefined): string | null {
  const link = (linkRaw ?? "").trim();
  if (link) {
    if (/^https?:\/\//i.test(link)) return link;
    if (/^amazon\./i.test(link)) return `https://www.${link.replace(/^https?:\/\/(www\.)?/, "")}`;
    if (/^[A-Z0-9]{10}$/.test(link)) return `https://www.amazon.de/dp/${link}`;
  }
  const asin = (asinRaw ?? "").trim();
  if (/^[A-Z0-9]{10}$/.test(asin)) return `https://www.amazon.de/dp/${asin}`;
  return null;
}

function variantsAreStale(variants: unknown, newUrl: string): boolean {
  if (!Array.isArray(variants) || variants.length === 0) return false;
  const newAsin = extractAsin(newUrl);
  if (!newAsin) return false;
  for (const v of variants) {
    if (typeof v !== "object" || v === null) continue;
    const candidates = [
      (v as Record<string, unknown>).url,
      (v as Record<string, unknown>).asin,
      (v as Record<string, unknown>).sku,
    ];
    for (const c of candidates) {
      if (typeof c !== "string") continue;
      if (extractAsin(c) === newAsin) return false;
    }
  }
  return true;
}

function extractAsin(s: string): string | null {
  const m = s.match(/\b(B0[A-Z0-9]{8})\b/);
  return m ? m[1] : null;
}

export async function deleteInventorySource(): Promise<void> {
  const user = await requireAdmin();
  await prisma.$transaction([
    prisma.inventorySnapshot.deleteMany({ where: { organizationId: user.organizationId } }),
    prisma.inventorySource.deleteMany({ where: { organizationId: user.organizationId } }),
  ]);
  revalidatePath("/admin/inventory");
  revalidatePath("/products");
}

function looksLikeWrongTab(headers: string[]): boolean {
  // Heuristik: viele Auto-Fallback-Header („Spalte N") oder Monatsnamen
  // deuten darauf hin, dass nicht die Master-Tab geladen wurde.
  const monthNames = /^(januar|februar|m(ä|a)rz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|month|monat)$/i;
  const fallbackPattern = /^Spalte \d+$/;
  const monthCount = headers.filter((h) => monthNames.test(h)).length;
  const fallbackCount = headers.filter((h) => fallbackPattern.test(h)).length;
  return monthCount >= 3 || fallbackCount >= headers.length / 2;
}
