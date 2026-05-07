import * as XLSX from "xlsx";
import type { ImportRow, ParseResult } from "./types";

const MAX_ROWS = 2000;

const GOOGLE_FETCH_HEADERS: HeadersInit = {
  // Server-side fetch ohne UA wird von Google teilweise auf eine
  // Login-Seite umgeleitet — auch bei "Mit Link freigeben". Browser-UA fixt das.
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/csv, text/plain, */*",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
};

export type ParseOptions = {
  /** 1-based: which row contains the column headers. Default 1. */
  headerRow?: number;
  /** Override the gid for Google Sheets. */
  gid?: string;
  /** Tab-Name (z. B. "Master") — überschreibt gid, da stabiler als gid in URLs. */
  sheetName?: string;
};

/**
 * Parse an uploaded file (xlsx or csv).
 */
export async function parseUpload(file: File, options: ParseOptions = {}): Promise<ParseResult> {
  const buf = Buffer.from(await file.arrayBuffer());
  const isCsv =
    file.name.toLowerCase().endsWith(".csv") ||
    file.type === "text/csv" ||
    file.type === "application/csv";
  const workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
  return workbookToResult(workbook, isCsv ? "csv" : "excel", options);
}

type SheetIds = { spreadsheetId: string; gid: string };

export function parseSheetIds(url: string): SheetIds | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.endsWith("docs.google.com")) return null;
    const m = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!m) return null;
    const id = m[1];
    const gidFromHash = new URLSearchParams(u.hash.replace(/^#/, "")).get("gid");
    const gidFromQuery = u.searchParams.get("gid");
    const gid = gidFromQuery ?? gidFromHash ?? "0";
    return { spreadsheetId: id, gid };
  } catch {
    return null;
  }
}

/**
 * Fetch a public Google Sheet. Sharing must be at least "Anyone with the link can view".
 *
 * Google has multiple CSV endpoints with different quirks:
 *  - /export?format=csv      bevorzugter Pfad
 *  - /gviz/tq?tqx=out:csv    Fallback, gibt klarere Fehler
 *  - /pub?output=csv         braucht "Im Web veröffentlicht"
 *
 * Wenn beide bevorzugten Pfade HTML zurückliefern, ist die Freigabe nicht offen genug.
 */
export async function parseGoogleSheet(url: string, options: ParseOptions = {}): Promise<ParseResult> {
  const ids = parseSheetIds(url);
  if (!ids) {
    throw new Error(
      "Konnte die Google-Sheets-URL nicht lesen. Bitte die normale Tabellen-URL einfügen (https://docs.google.com/spreadsheets/d/...).",
    );
  }
  const sheetName = options.sheetName?.trim();
  const gid = options.gid?.trim() || ids.gid;

  // Tab-Name hat Priorität: er ist stabil über URL-Wechsel hinweg.
  // Google's gviz-Endpoint akzeptiert &sheet={Name}.
  const attempts: Array<{ url: string; label: string }> = [];
  if (sheetName) {
    attempts.push({
      url: `https://docs.google.com/spreadsheets/d/${ids.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`,
      label: `Tab "${sheetName}"`,
    });
  }
  attempts.push(
    {
      url: `https://docs.google.com/spreadsheets/d/${ids.spreadsheetId}/export?format=csv&gid=${gid}`,
      label: `gid ${gid}`,
    },
    {
      url: `https://docs.google.com/spreadsheets/d/${ids.spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
      label: `gid ${gid} (gviz)`,
    },
  );

  let lastError = "";
  for (const attempt of attempts) {
    const csv = await tryFetchCsv(attempt.url);
    if (csv.kind === "ok") {
      const workbook = XLSX.read(csv.body, { type: "string" });
      const result = workbookToResult(workbook, "google-sheets", options);
      result.warnings.unshift(
        `Geladen: ${attempt.label} · ${csv.body.split(/\r?\n/).length} Roh-Zeilen aus Google.`,
      );
      return result;
    }
    lastError = csv.error;
  }

  throw new Error(
    `Google-Sheet konnte nicht als CSV gelesen werden. ${lastError} ` +
      "Bitte unter 'Freigeben' sicherstellen, dass 'Jeder, der über den Link verfügt' (Viewer) eingestellt ist — restriktivere Modi (z. B. 'Restricted') reichen nicht.",
  );
}

type FetchResult = { kind: "ok"; body: string } | { kind: "fail"; error: string };

async function tryFetchCsv(endpoint: string): Promise<FetchResult> {
  let res: Response;
  try {
    res = await fetch(endpoint, { redirect: "follow", headers: GOOGLE_FETCH_HEADERS });
  } catch (err) {
    return { kind: "fail", error: `Netzwerkfehler: ${err instanceof Error ? err.message : "fetch failed"}.` };
  }
  if (!res.ok) {
    return { kind: "fail", error: `HTTP ${res.status} bei ${new URL(endpoint).pathname}.` };
  }
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const body = await res.text();
  const looksLikeHtml = contentType.includes("html") || /^\s*</.test(body);
  if (looksLikeHtml) {
    return { kind: "fail", error: classifyHtml(body) };
  }
  if (!body.trim()) {
    return { kind: "fail", error: "Antwort war leer." };
  }
  return { kind: "ok", body };
}

function classifyHtml(body: string): string {
  const lower = body.toLowerCase();
  if (lower.includes("accounts.google.com") || lower.includes("servicelogin") || lower.includes("signin")) {
    return "Google fordert einen Login an — Freigabe ist noch privat.";
  }
  if (lower.includes("rate limit") || lower.includes("quota")) {
    return "Google meldet ein Rate-Limit — bitte kurz warten und erneut versuchen.";
  }
  return "Google liefert HTML statt CSV (vermutlich Berechtigungsproblem).";
}

function workbookToResult(
  workbook: XLSX.WorkBook,
  source: ParseResult["source"],
  options: ParseOptions,
): ParseResult {
  const sheetName = workbook.SheetNames[0];
  const warnings: string[] = [];
  if (!sheetName) {
    return { headers: [], rows: [], source, warnings: ["Keine Tabelle in der Datei gefunden."] };
  }
  const sheet = workbook.Sheets[sheetName];

  // Read everything as a 2D array first so we can pick any header row.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
    rawNumbers: false,
  });

  if (matrix.length === 0) {
    return { headers: [], rows: [], source, sheetName, warnings: ["Tabelle ist leer."] };
  }

  // Choose header row (1-based). Fallback: auto-detect — pick the first row
  // whose non-empty count is >= max(2, half the widest row).
  const requested = options.headerRow ?? 0;
  let headerRowIndex = requested > 0 ? requested - 1 : autoDetectHeaderRow(matrix);
  if (headerRowIndex >= matrix.length) {
    warnings.push(
      `Header-Zeile ${headerRowIndex + 1} liegt jenseits der Tabelle (${matrix.length} Zeilen). Erste Zeile wird genutzt.`,
    );
    headerRowIndex = 0;
  }
  if (headerRowIndex !== 0 && requested === 0) {
    warnings.push(`Header automatisch in Zeile ${headerRowIndex + 1} erkannt.`);
  }

  // Leere Header-Zellen bekommen einen Excel-Buchstaben-Fallback ("Spalte A",
  // "Spalte R", ...) — so kann der User in seiner Beschreibung wörtlich
  // "Spalte R" sagen, auch wenn die echte Sheet dort einen merged-Cell-Header
  // ohne Text in dieser Position hat.
  const rawHeaders = (matrix[headerRowIndex] ?? []).map(
    (v, i) => stringValue(v) || `Spalte ${columnIndexToExcelLetter(i)}`,
  );
  const headers = ensureUniqueHeaders(rawHeaders);

  const dataRows = matrix.slice(headerRowIndex + 1);
  if (dataRows.length > MAX_ROWS) {
    warnings.push(`Mehr als ${MAX_ROWS} Zeilen — der Import begrenzt auf die ersten ${MAX_ROWS}.`);
  }

  const rows: ImportRow[] = dataRows
    .slice(0, MAX_ROWS)
    .map((row) => rowToObject(row, headers))
    .filter((row) => Object.values(row).some((v) => v && v.length));

  return { headers, rows, source, sheetName, warnings };
}

function autoDetectHeaderRow(matrix: unknown[][]): number {
  // Bewertet die ersten 8 Zeilen und sucht die mit dem höchsten Anteil an
  // kurzen Textzellen (Header-Stichworte). Numerisch dominante Zeilen werden
  // bestraft, damit eine erste Daten-Zeile (AZ001, $0.95, 835, ...) nicht
  // als Header-Zeile gewählt wird.
  const limit = Math.min(8, matrix.length);
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < limit; i++) {
    const row = matrix[i] ?? [];
    let nonEmpty = 0;
    let textLike = 0;
    let numericLike = 0;
    for (const cell of row) {
      const s = stringValue(cell);
      if (!s) continue;
      nonEmpty += 1;
      const looksNumeric = /^[\s\-+€$]?[\d.,\s]+\s?[€$%]?$/.test(s) || /^TRUE|FALSE$/i.test(s);
      const looksText = s.length <= 60 && /[A-Za-zÄÖÜäöüß]/.test(s) && !looksNumeric;
      if (looksText) textLike += 1;
      else if (looksNumeric) numericLike += 1;
    }
    // Header braucht min. 3 Textzellen, und Text muss klar überwiegen.
    if (textLike < 3) continue;
    if (numericLike >= textLike) continue;
    const score = textLike * 2 - numericLike + nonEmpty * 0.1;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function columnIndexToExcelLetter(index: number): string {
  let i = index;
  let s = "";
  while (i >= 0) {
    s = String.fromCharCode((i % 26) + 65) + s;
    i = Math.floor(i / 26) - 1;
  }
  return s;
}

function ensureUniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const base = h || "Spalte";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function rowToObject(row: unknown[], headers: string[]): ImportRow {
  const out: ImportRow = {};
  for (let i = 0; i < headers.length; i++) {
    out[headers[i]] = stringValue(row[i]);
  }
  return out;
}

function stringValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}
