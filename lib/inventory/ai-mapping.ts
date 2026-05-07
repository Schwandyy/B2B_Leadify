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

  const provider = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  const hasKey =
    (provider === "openai" && Boolean(process.env.OPENAI_API_KEY)) ||
    (provider === "anthropic" && Boolean(process.env.ANTHROPIC_API_KEY));

  if (!hasKey) {
    return heuristic(args);
  }

  try {
    return await viaAI(args);
  } catch (err) {
    const fallback = heuristic(args);
    fallback.warnings.unshift(
      `KI-Aufruf fehlgeschlagen (${err instanceof Error ? err.message : "unbekannt"}) — Heuristik genutzt.`,
    );
    return fallback;
  }
}

async function viaAI(args: SuggestArgs): Promise<MappingSuggestion> {
  const client = getAIClient();
  const sample = args.sampleRows.slice(0, 5);

  const system =
    "Du hilfst beim Mapping von Spalten einer Tabelle (z. B. Lagerbestand-Export) " +
    "auf zwei interne Felder: SKU/AZ-Code und verfügbarer Bestand (Integer). " +
    "Antworte ausschließlich mit JSON nach dem vorgegebenen Schema. " +
    "Nutze ausschließlich Werte, die exakt einem der gegebenen Header entsprechen. " +
    "Wenn keine Spalte passt, setze das Feld auf null.";

  const prompt = [
    args.description
      ? `Beschreibung des Nutzers, was die Tabelle enthalten soll:\n${args.description}\n`
      : "Keine zusätzliche Beschreibung des Nutzers vorhanden.\n",
    `Header der geladenen Sheet (in Original-Schreibweise):\n${JSON.stringify(args.headers)}`,
    `Erste ${sample.length} Datenzeile(n) als Plausibilitätshilfe:\n${JSON.stringify(sample, null, 2)}`,
    "Aufgabe: Wähle den am besten passenden Header für (a) AZ-Code/SKU und " +
      "(b) verfügbarer Bestand. AZ-Codes sehen typischerweise wie 'AZ001' oder 'AZ-Delivery-1234' aus, " +
      "Bestände sind ganze Zahlen >= 0. confidence ist 'high', wenn die Beschreibung klar passt UND die " +
      "Werte plausibel sind; 'medium' bei einer der beiden Bedingungen; 'low' sonst.",
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

function heuristic({ headers, sampleRows, description }: SuggestArgs): MappingSuggestion {
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

  const skuMatch = matchHeader(lowerHeaders, skuPatterns);
  const stockMatch = matchHeader(lowerHeaders, stockPatterns);

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
