"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { syncInventory } from "@/lib/inventory/sync";
import { parseGoogleSheet } from "@/lib/import/parser";
import { suggestColumnMapping, type MappingSuggestion } from "@/lib/inventory/ai-mapping";

export type SaveSourceInput = {
  sheetUrl: string;
  gid?: string;
  headerRow?: number;
  description?: string;
  skuColumn: string;
  stockColumn: string;
};

export type SaveSourceResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveInventorySource(input: SaveSourceInput): Promise<SaveSourceResult> {
  const user = await requireAdmin();

  const url = input.sheetUrl.trim();
  const sku = input.skuColumn.trim();
  const stock = input.stockColumn.trim();
  if (!url) return { ok: false, error: "Sheet-URL fehlt." };
  if (!sku) return { ok: false, error: "Spalte für AZ-Code fehlt." };
  if (!stock) return { ok: false, error: "Spalte für Bestand fehlt." };

  const description = input.description?.trim() || null;

  await prisma.inventorySource.upsert({
    where: { organizationId: user.organizationId },
    create: {
      organizationId: user.organizationId,
      sheetUrl: url,
      gid: input.gid?.trim() || null,
      headerRow: input.headerRow ?? null,
      description,
      skuColumn: sku,
      stockColumn: stock,
    },
    update: {
      sheetUrl: url,
      gid: input.gid?.trim() || null,
      headerRow: input.headerRow ?? null,
      description,
      skuColumn: sku,
      stockColumn: stock,
    },
  });

  revalidatePath("/admin/inventory");
  return { ok: true };
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

export type AnalyzeMappingInput = {
  sheetUrl: string;
  gid?: string;
  headerRow?: number;
  description?: string;
};

export type AnalyzeMappingResult =
  | {
      ok: true;
      headers: string[];
      suggestion: MappingSuggestion;
      warnings: string[];
      sheetWarnings: string[];
    }
  | { ok: false; error: string };

export async function analyzeMapping(input: AnalyzeMappingInput): Promise<AnalyzeMappingResult> {
  await requireAdmin();
  const url = input.sheetUrl.trim();
  if (!url) return { ok: false, error: "Bitte zuerst die Sheet-URL eintragen." };

  let parsed;
  try {
    parsed = await parseGoogleSheet(url, {
      headerRow: input.headerRow,
      gid: input.gid?.trim() || undefined,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Sheet konnte nicht gelesen werden.",
    };
  }

  const suggestion = await suggestColumnMapping({
    headers: parsed.headers,
    sampleRows: parsed.rows.slice(0, 5),
    description: input.description?.trim() || undefined,
  });

  return {
    ok: true,
    headers: parsed.headers,
    suggestion,
    warnings: suggestion.warnings,
    sheetWarnings: parsed.warnings,
  };
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
