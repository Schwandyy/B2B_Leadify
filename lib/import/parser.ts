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

const GOOGLE_FETCH_HEADERS: HeadersInit = {
  // Google's edge serves a different response for "browser-like" agents:
  // server-side fetch without UA gets bounced to a sign-in page even for
  // link-shared sheets. A real-browser-shaped UA fixes that.
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/csv, text/plain, */*",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
};

type SheetIds = { spreadsheetId: string; gid: string };

/**
 * Fetch a public Google Sheet. Sharing must be at least "Viewable with the link".
 *
 * Google has multiple CSV endpoints with different quirks:
 *  - /export?format=csv      works when "Anyone with the link can view"
 *  - /gviz/tq?tqx=out:csv    same access rules, often more permissive about
 *                            UA, gives clearer errors
 *  - /pub?output=csv         only works when "Publish to web" is enabled
 *
 * We try (1), then (2) — if both fail with HTML, the user almost certainly
 * needs "Anyone with the link" instead of restricted sharing.
 */
export async function parseGoogleSheet(url: string): Promise<ParseResult> {
  const ids = parseSheetIds(url);
  if (!ids) {
    throw new Error(
      "Konnte die Google-Sheets-URL nicht lesen. Bitte die normale Tabellen-URL einfügen (https://docs.google.com/spreadsheets/d/...).",
    );
  }

  const attempts = [
    `https://docs.google.com/spreadsheets/d/${ids.spreadsheetId}/export?format=csv&gid=${ids.gid}`,
    `https://docs.google.com/spreadsheets/d/${ids.spreadsheetId}/gviz/tq?tqx=out:csv&gid=${ids.gid}`,
  ];

  let lastError = "";
  for (const endpoint of attempts) {
    const csv = await tryFetchCsv(endpoint);
    if (csv.kind === "ok") {
      const workbook = XLSX.read(csv.body, { type: "string" });
      return workbookToResult(workbook, "google-sheets");
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
  // Anything HTML-ish means Google didn't actually deliver the CSV: usually
  // an interstitial sign-in page, an "AccessDenied" or rate-limit page.
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

function parseSheetIds(url: string): SheetIds | null {
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
