import { NextResponse } from "next/server";

// Lightweight Health-Check für Container-Healthcheck und Reverse-Proxy-Probes.
// Schreibt nichts, fragt nichts — antwortet einfach 200.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
