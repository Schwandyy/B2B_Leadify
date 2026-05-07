import * as XLSX from "xlsx";
import type { ImportRow, ParseResult } from "./types";

const MAX_ROWS = 2000;

/**
 * Parse an uploaded file (xlsx or csv). xlsx-lib autodetects, so the same
 * code path handles both. Returns the first sheet only.
 */
export async function parseUpload(file: File): Promise<ParseResult> {
  const buf = Buffer.from(await file.arrayBuffer());
  const isCsv =
    file.name.toLowerCase().endsWith(".csv") ||
    file.type === "text/csv" ||
    file.type === "application/csv";
  const workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
  return workbookToResult(workbook, isCsv ? "csv" : "excel");
}

/**
 * Fetch a public Google Sheet (sharing must be "Viewable with the link" or
 * fully public). We accept either a normal /edit URL or an /export URL —
 * we transform it into the CSV export endpoint so we never need OAuth.
 */
export async function parseGoogleSheet(url: string): Promise<ParseResult> {
  const exportUrl = toCsvExportUrl(url);
  if (!exportUrl) {
    throw new Error(
      "Konnte die Google-Sheets-URL nicht in eine Export-URL umwandeln. Stelle sicher, dass das Sheet öffentlich oder mit Link freigegeben ist.",
    );
  }
  const res = await fetch(exportUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(
      `Google-Sheet konnte nicht geladen werden (HTTP ${res.status}). Ist die Freigabe 'Jeder mit Link' gesetzt?`,
    );
  }
  const text = await res.text();
  // Quick sanity check: Google sometimes returns HTML for permission errors.
  if (text.startsWith("<")) {
    throw new Error(
      "Google liefert HTML statt CSV — meist ein Berechtigungsproblem. Setze die Freigabe auf 'Jeder mit Link'.",
    );
  }
  const workbook = XLSX.read(text, { type: "string" });
  return workbookToResult(workbook, "google-sheets");
}

function toCsvExportUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.endsWith("docs.google.com")) return null;
    const m = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!m) return null;
    const id = m[1];
    const gidFromHash = new URLSearchParams(u.hash.replace(/^#/, "")).get("gid");
    const gidFromQuery = u.searchParams.get("gid");
    const gid = gidFromQuery ?? gidFromHash ?? "0";
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  } catch {
    return null;
  }
}

function workbookToResult(workbook: XLSX.WorkBook, source: ParseResult["source"]): ParseResult {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], source, warnings: ["Keine Tabelle in der Datei gefunden."] };
  }
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    defval: "",
    rawNumbers: false,
  });
  const warnings: string[] = [];
  if (json.length > MAX_ROWS) {
    warnings.push(`Mehr als ${MAX_ROWS} Zeilen — der Import begrenzt auf die ersten ${MAX_ROWS}.`);
  }
  const limited = json.slice(0, MAX_ROWS);
  const headers = collectHeaders(limited);
  const rows: ImportRow[] = limited
    .map((row) => normaliseRow(row, headers))
    .filter((row) => Object.values(row).some((v) => v && v.length));
  return { headers, rows, source, sheetName, warnings };
}

function collectHeaders(rows: Array<Record<string, unknown>>): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

function normaliseRow(row: Record<string, unknown>, headers: string[]): ImportRow {
  const out: ImportRow = {};
  for (const h of headers) {
    const v = row[h];
    if (v === null || v === undefined) {
      out[h] = "";
    } else if (typeof v === "string") {
      out[h] = v.trim();
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[h] = String(v);
    } else if (v instanceof Date) {
      out[h] = v.toISOString();
    } else {
      out[h] = String(v).trim();
    }
  }
  return out;
}
