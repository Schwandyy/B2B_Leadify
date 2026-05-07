import { getAIClient } from "@/lib/ai/client";
import type { ImportRow } from "@/lib/import/types";

export type MappingSuggestion = {
  skuColumn: string | null;
  stockColumn: string | null;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  warnings: string[];
  source: "ai" | "heuristic";
  model?: string;
};

export type SuggestArgs = {
  headers: string[];
  sampleRows: ImportRow[];
  description?: string;
};

/**
 * Schlägt anhand der Sheet-Header und einer optionalen Freitext-Beschreibung
 * die passende Spalte für AZ-Code und Bestand vor. Greift auf den
 * konfigurierten KI-Provider zurück; im Mock-Modus liefert eine simple
 * Regex-Heuristik den Vorschlag, damit die Funktion lokal ohne Keys
 * brauchbar bleibt.
 */
export async function suggestColumnMapping(args: SuggestArgs): Promise<MappingSuggestion> {
  if (args.headers.length === 0) {
    return {
      skuColumn: null,
      stockColumn: null,
      confidence: "low",
      reasoning: "Sheet hat keine Spalten.",
      warnings: ["Keine Header gefunden — wurde die Sheet überhaupt geladen?"],
      source: "heuristic",
    };
  }

  // Schritt 1: Explizite Excel-Spaltenangaben aus der Beschreibung deuten
  // ("AZ-Code in Spalte A", "Bestand in Spalte R"). Wenn der User es klar
  // sagt, nehmen wir es wörtlich und brauchen keine KI mehr.
  const explicit = extractExplicitColumns(args.description ?? "", args.headers);
  if (explicit.skuColumn && explicit.stockColumn) {
    return {
      skuColumn: explicit.skuColumn,
      stockColumn: explicit.stockColumn,
      confidence: "high",
      reasoning: `Übernommen aus deiner Beschreibung: ${explicit.reasoning}`,
      warnings: [],
      source: "heuristic",
    };
  }

  const provider = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  const hasKey =
    (provider === "openai" && Boolean(process.env.OPENAI_API_KEY)) ||
    (provider === "anthropic" && Boolean(process.env.ANTHROPIC_API_KEY));

  if (!hasKey) {
    return heuristic(args, explicit);
  }

  try {
    const result = await viaAI(args, explicit);
    return result;
  } catch (err) {
    const fallback = heuristic(args, explicit);
    fallback.warnings.unshift(
      `KI-Aufruf fehlgeschlagen (${err instanceof Error ? err.message : "unbekannt"}) — Heuristik genutzt.`,
    );
    return fallback;
  }
}

type ExplicitHints = {
  skuColumn: string | null;
  stockColumn: string | null;
  reasoning: string;
};

/**
 * Sucht in der Freitext-Beschreibung nach "Tab 'Master'", "Tab \"X\"" oder
 * "im Tab Master". Liefert den Tab-Namen ohne Quotes zurück, oder null.
 */
export function extractTabName(description: string): string | null {
  if (!description.trim()) return null;
  const patterns = [
    /\btab\s+['"„]([^'"„""]+)['"""]/i,
    /\btab\s+([A-Z][A-Za-z0-9_\- ]{0,30})\b/,
    /\bsheet\s+['"„]([^'"„""]+)['"""]/i,
  ];
  for (const re of patterns) {
    const m = re.exec(description);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

/**
 * Sucht in der Freitext-Beschreibung nach "Spalte A", "Spalte R" etc. und
 * ordnet jede Erwähnung dem näher liegenden Schlüsselwort zu (SKU vs. Bestand).
 */
function extractExplicitColumns(description: string, headers: string[]): ExplicitHints {
  if (!description.trim()) return { skuColumn: null, stockColumn: null, reasoning: "" };

  const skuKw = /(?:az[-\s]?code|az[-\s]?delivery|\bsku\b|artikel(?:nummer)?|master[-\s]?sku|produkt[-\s]?code)/gi;
  const stockKw = /(?:bestand|verf(?:ü|u)gbar|lager|stock|menge|anzahl|inventory)/gi;
  const spalteRe = /\bspalte\s+([a-z]{1,3})\b/gi;

  let skuLetter: string | null = null;
  let stockLetter: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = spalteRe.exec(description)) !== null) {
    const letter = m[1];
    const before = description.slice(0, m.index);
    const lastSku = lastMatchEnd(before, skuKw);
    const lastStock = lastMatchEnd(before, stockKw);
    if (lastSku === -1 && lastStock === -1) continue;
    const skuWins = lastSku !== -1 && (lastStock === -1 || lastSku > lastStock);
    if (skuWins) {
      if (!skuLetter) skuLetter = letter;
    } else if (lastStock !== -1) {
      if (!stockLetter) stockLetter = letter;
    }
  }

  const skuIdx = skuLetter ? excelLetterToIndex(skuLetter) : null;
  const stockIdx = stockLetter ? excelLetterToIndex(stockLetter) : null;

  const skuCol = skuIdx !== null && skuIdx >= 0 && skuIdx < headers.length ? headers[skuIdx] : null;
  const stockCol = stockIdx !== null && stockIdx >= 0 && stockIdx < headers.length ? headers[stockIdx] : null;

  const parts: string[] = [];
  if (skuCol) parts.push(`Spalte ${skuLetter?.toUpperCase()} → "${skuCol}"`);
  if (stockCol) parts.push(`Spalte ${stockLetter?.toUpperCase()} → "${stockCol}"`);

  return {
    skuColumn: skuCol,
    stockColumn: stockCol,
    reasoning: parts.join(", "),
  };
}

function lastMatchEnd(text: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) last = m.index;
  return last;
}

function excelLetterToIndex(letters: string): number | null {
  if (!/^[a-zA-Z]+$/.test(letters)) return null;
  const upper = letters.toUpperCase();
  let idx = 0;
  for (const ch of upper) {
    idx = idx * 26 + (ch.charCodeAt(0) - "A".charCodeAt(0) + 1);
  }
  return idx - 1;
}

async function viaAI(args: SuggestArgs, explicit: ExplicitHints): Promise<MappingSuggestion> {
  const client = getAIClient();
  const sample = args.sampleRows.slice(0, 5);

  const headerLetterMap = args.headers
    .map((h, i) => `${indexToExcelLetter(i)}=${JSON.stringify(h)}`)
    .join(", ");

  const explicitNote =
    explicit.skuColumn || explicit.stockColumn
      ? `\nAus der Beschreibung wurde bereits explizit erkannt: ` +
        `${explicit.skuColumn ? `AZ-Code = "${explicit.skuColumn}"` : "AZ-Code: nicht aus Beschreibung ableitbar"}; ` +
        `${explicit.stockColumn ? `Bestand = "${explicit.stockColumn}"` : "Bestand: nicht aus Beschreibung ableitbar"}. ` +
        `Du MUSST diese Werte übernehmen, falls sie gesetzt sind.`
      : "";

  const system =
    "Du hilfst beim Mapping von Spalten einer Tabelle (z. B. Lagerbestand-Export) " +
    "auf zwei interne Felder: SKU/AZ-Code und verfügbarer Bestand (Integer). " +
    "Antworte ausschließlich mit JSON nach dem vorgegebenen Schema. " +
    "Nutze ausschließlich Werte, die exakt einem der gegebenen Header entsprechen. " +
    "Wenn der Nutzer Excel-Spaltenbuchstaben (Spalte A, B, R, ...) nennt, " +
    "wandle diese über die mitgelieferte Letter→Header-Tabelle um und nimm GENAU diesen Header. " +
    "Wenn keine Spalte passt, setze das Feld auf null.";

  const prompt = [
    args.description
      ? `Beschreibung des Nutzers, was die Tabelle enthalten soll:\n${args.description}\n`
      : "Keine zusätzliche Beschreibung des Nutzers vorhanden.\n",
    `Header der geladenen Sheet (in Original-Schreibweise):\n${JSON.stringify(args.headers)}`,
    `Excel-Spaltenbuchstaben → Header (für Beschreibungen wie "Spalte A"):\n${headerLetterMap}`,
    `Erste ${sample.length} Datenzeile(n) als Plausibilitätshilfe:\n${JSON.stringify(sample, null, 2)}`,
    "Aufgabe: Wähle den am besten passenden Header für (a) AZ-Code/SKU und " +
      "(b) verfügbarer Bestand. AZ-Codes sehen typischerweise wie 'AZ001' oder 'AZ-Delivery-1234' aus, " +
      "Bestände sind ganze Zahlen >= 0. confidence ist 'high', wenn die Beschreibung klar passt UND die " +
      "Werte plausibel sind; 'medium' bei einer der beiden Bedingungen; 'low' sonst." +
      explicitNote,
  ].join("\n\n");

  const { data, model } = await client.generateJSON<{
    skuColumn: string | null;
    stockColumn: string | null;
    confidence: "high" | "medium" | "low";
    reasoning: string;
  }>({
    system,
    prompt,
    schemaName: "InventoryColumnMapping",
    schemaHint:
      "{ skuColumn: string|null, stockColumn: string|null, confidence: 'high'|'medium'|'low', reasoning: string }",
    temperature: 0.1,
  });

  const warnings: string[] = [];
  if (data.skuColumn && !args.headers.includes(data.skuColumn)) {
    warnings.push(`Vorgeschlagene SKU-Spalte "${data.skuColumn}" steht nicht in den Headern.`);
  }
  if (data.stockColumn && !args.headers.includes(data.stockColumn)) {
    warnings.push(`Vorgeschlagene Bestand-Spalte "${data.stockColumn}" steht nicht in den Headern.`);
  }
  if (!data.skuColumn) warnings.push("Keine SKU-Spalte erkannt — bitte manuell setzen.");
  if (!data.stockColumn) warnings.push("Keine Bestand-Spalte erkannt — bitte manuell setzen.");

  return {
    skuColumn: data.skuColumn && args.headers.includes(data.skuColumn) ? data.skuColumn : null,
    stockColumn: data.stockColumn && args.headers.includes(data.stockColumn) ? data.stockColumn : null,
    confidence: data.confidence ?? "low",
    reasoning: data.reasoning ?? "",
    warnings,
    source: "ai",
    model,
  };
}

function indexToExcelLetter(index: number): string {
  let i = index;
  let s = "";
  while (i >= 0) {
    s = String.fromCharCode((i % 26) + 65) + s;
    i = Math.floor(i / 26) - 1;
  }
  return s;
}

function heuristic(
  { headers, sampleRows, description }: SuggestArgs,
  explicit: ExplicitHints = { skuColumn: null, stockColumn: null, reasoning: "" },
): MappingSuggestion {
  const lowerHeaders = headers.map((h) => ({ original: h, lower: h.toLowerCase() }));

  const skuPatterns = [
    /az[-_\s]?code/,
    /az[-_\s]?delivery/,
    /master[-_\s]?sku/,
    /artikelnummer/,
    /artikel[-_\s]?nr/,
    /\bsku\b/,
    /produkt[-_\s]?code/,
  ];
  const stockPatterns = [
    /verf(ü|ue)gbar/,
    /bestand/,
    /stock/,
    /lager/,
    /inventory/,
    /menge/,
    /\bqty\b/,
  ];

  // Explizite Spaltenangaben aus der Beschreibung gewinnen immer.
  const skuMatch = explicit.skuColumn ?? matchHeader(lowerHeaders, skuPatterns);
  const stockMatch = explicit.stockColumn ?? matchHeader(lowerHeaders, stockPatterns);

  const warnings: string[] = [];
  if (!skuMatch) warnings.push("Keine SKU-Spalte per Heuristik erkannt — bitte manuell setzen.");
  if (!stockMatch) warnings.push("Keine Bestand-Spalte per Heuristik erkannt — bitte manuell setzen.");

  // Plausibilitätscheck mit den Sample-Rows: ist die Bestand-Spalte numerisch?
  if (stockMatch && sampleRows.length > 0) {
    const numeric = sampleRows.filter((r) => /^-?\d+([.,]\d+)?$/.test((r[stockMatch] ?? "").trim()));
    if (numeric.length === 0) {
      warnings.push(`Spalte "${stockMatch}" enthält keine Zahlen in den Beispielzeilen.`);
    }
  }

  const reasoning = description
    ? "Heuristik (KI nicht aktiv): Header per Regex auf bekannte Muster gematcht; deine Beschreibung wurde nicht ausgewertet."
    : "Heuristik: Header per Regex auf bekannte Muster gematcht.";

  return {
    skuColumn: skuMatch,
    stockColumn: stockMatch,
    confidence: skuMatch && stockMatch ? "medium" : "low",
    reasoning,
    warnings,
    source: "heuristic",
  };
}

function matchHeader(
  lowered: Array<{ original: string; lower: string }>,
  patterns: RegExp[],
): string | null {
  for (const pattern of patterns) {
    const hit = lowered.find((h) => pattern.test(h.lower));
    if (hit) return hit.original;
  }
  return null;
}
