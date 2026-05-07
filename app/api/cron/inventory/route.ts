import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncInventory } from "@/lib/inventory/sync";

// Vercel-Cron läuft ohne Cookie-Session. Wir verifizieren über CRON_SECRET,
// das Vercel als Bearer-Token in den Authorization-Header schreibt.
// Cron-Konfiguration: vercel.json (wöchentlich Mo 06:00 UTC).

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET fehlt." }, { status: 500 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sources = await prisma.inventorySource.findMany({ select: { organizationId: true } });
  const results: Array<{
    organizationId: string;
    ok: boolean;
    rowsRead: number;
    rowsWritten: number;
    error?: string;
  }> = [];

  for (const src of sources) {
    try {
      const r = await syncInventory(src.organizationId);
      results.push({
        organizationId: src.organizationId,
        ok: r.ok,
        rowsRead: r.rowsRead,
        rowsWritten: r.rowsWritten,
        error: r.error,
      });
    } catch (err) {
      results.push({
        organizationId: src.organizationId,
        ok: false,
        rowsRead: 0,
        rowsWritten: 0,
        error: err instanceof Error ? err.message : "unbekannter Fehler",
      });
    }
  }

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    organizations: results,
  });
}
