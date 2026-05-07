import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { parseUpload, parseGoogleSheet } from "@/lib/import/parser";
import { autoMap } from "@/lib/import/autoMap";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const sheetUrl = formData.get("sheetUrl");

  try {
    let result;
    if (file instanceof File && file.size > 0) {
      result = await parseUpload(file);
    } else if (typeof sheetUrl === "string" && sheetUrl.trim()) {
      result = await parseGoogleSheet(sheetUrl.trim());
    } else {
      return NextResponse.json({ error: "Bitte Datei hochladen oder Google-Sheets-URL angeben." }, { status: 400 });
    }

    const mapping = autoMap(result.headers);
    const sample = result.rows.slice(0, 8);
    return NextResponse.json({
      headers: result.headers,
      rowCount: result.rows.length,
      sample,
      mapping,
      source: result.source,
      sheetName: result.sheetName,
      warnings: result.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Datei konnte nicht gelesen werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
