import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { parseUpload, parseGoogleSheet } from "@/lib/import/parser";
import { runImport } from "@/lib/import/productImportService";
import type { ColumnMapping } from "@/lib/import/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const sheetUrl = formData.get("sheetUrl");
  const mappingRaw = formData.get("mapping");
  const enrichLinks = formData.get("enrichLinks") === "true";
  const autoAnalyze = formData.get("autoAnalyze") === "true";
  const headerRowRaw = formData.get("headerRow");
  const gid = typeof formData.get("gid") === "string" ? String(formData.get("gid")).trim() : "";

  const headerRowParsed = headerRowRaw ? parseInt(String(headerRowRaw), 10) : 0;
  const headerRow = Number.isFinite(headerRowParsed) && headerRowParsed > 0 ? headerRowParsed : undefined;

  let mapping: ColumnMapping;
  try {
    mapping = mappingRaw ? (JSON.parse(String(mappingRaw)) as ColumnMapping) : {};
  } catch {
    return NextResponse.json({ error: "Ungültiges Mapping." }, { status: 400 });
  }
  if (!mapping.name) {
    return NextResponse.json(
      { error: "Mapping unvollständig — bitte eine Spalte für 'Produktname' auswählen." },
      { status: 400 },
    );
  }

  let parseResult;
  try {
    if (file instanceof File && file.size > 0) {
      parseResult = await parseUpload(file, { headerRow });
    } else if (typeof sheetUrl === "string" && sheetUrl.trim()) {
      parseResult = await parseGoogleSheet(sheetUrl.trim(), { headerRow, gid: gid || undefined });
    } else {
      return NextResponse.json({ error: "Datei oder Google-Sheets-URL fehlt." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Parse fehlgeschlagen." }, { status: 400 });
  }

  const result = await runImport({
    organizationId: user.organizationId,
    ownerId: user.id,
    rows: parseResult.rows,
    mapping,
    options: { enrichLinks, autoAnalyze },
  });

  revalidatePath("/products");
  revalidatePath("/dashboard");

  return NextResponse.json(result);
}
