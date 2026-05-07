"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { syncInventory } from "@/lib/inventory/sync";

export type SaveSourceInput = {
  sheetUrl: string;
  gid?: string;
  headerRow?: number;
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

  await prisma.inventorySource.upsert({
    where: { organizationId: user.organizationId },
    create: {
      organizationId: user.organizationId,
      sheetUrl: url,
      gid: input.gid?.trim() || null,
      headerRow: input.headerRow ?? null,
      skuColumn: sku,
      stockColumn: stock,
    },
    update: {
      sheetUrl: url,
      gid: input.gid?.trim() || null,
      headerRow: input.headerRow ?? null,
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

export async function deleteInventorySource(): Promise<void> {
  const user = await requireAdmin();
  await prisma.$transaction([
    prisma.inventorySnapshot.deleteMany({ where: { organizationId: user.organizationId } }),
    prisma.inventorySource.deleteMany({ where: { organizationId: user.organizationId } }),
  ]);
  revalidatePath("/admin/inventory");
  revalidatePath("/products");
}
