import type { AIClient, GenerateJSONArgs, GenerateTextArgs } from "./types";

/**
 * Deterministic mock AI client. Used when AI_PROVIDER=mock or when API keys
 * are missing. The mock recognises the schema name and returns
 * believable B2B data so the rest of the app behaves realistically.
 */
export const mockAIClient: AIClient = {
  async generateJSON<T>({ schemaName, prompt }: GenerateJSONArgs) {
    const fixture = pickFixture(schemaName, prompt);
    return { data: fixture as T, model: "mock-1" };
  },
  async generateText({ prompt }: GenerateTextArgs) {
    return {
      text: defaultText(prompt),
      model: "mock-1",
    };
  },
};

function pickFixture(schemaName: string, prompt: string): unknown {
  switch (schemaName) {
    case "ProductAnalysis":
      return productAnalysisFixture(prompt);
    case "SearchQueries":
      return searchQueriesFixture(prompt);
    case "LeadRelevance":
      return leadRelevanceFixture(prompt);
    case "OutreachEmail":
      return outreachEmailFixture(prompt);
    case "OutreachLinkedIn":
      return outreachLinkedInFixture(prompt);
    case "OutreachFollowup":
      return outreachFollowupFixture(prompt);
    case "OutreachPhoneScript":
      return outreachPhoneFixture(prompt);
    default:
      return { note: `mock fixture for ${schemaName}`, prompt: prompt.slice(0, 200) };
  }
}

function productAnalysisFixture(prompt: string) {
  const isEducation = /schul|bildung|education|stem|maker|fab/i.test(prompt);
  const isElectronics = /arduino|raspberry|esp|sensor|elektronik|microcontroller/i.test(prompt);
  return {
    shortDescription: isElectronics
      ? "Lehrtaugliches Elektronik-Set mit Mikrocontroller, Sensoren und Lernmaterial."
      : "B2B-Produkt mit klarem Anwendungsnutzen für Geschäftskunden.",
    valueProposition: isElectronics
      ? "Ermöglicht Lehrkräften und technischen Trainern den Einstieg in Elektronik & IoT ohne Vorbereitungsaufwand."
      : "Reduziert Aufwand und Kosten beim Zielprozess der Käufer und schafft messbare Effizienzgewinne.",
    problemsSolved: isElectronics
      ? [
          "Hoher Vorbereitungsaufwand bei Praxisunterricht in Elektronik",
          "Zersplitterte Materialbeschaffung über viele Lieferanten",
          "Fehlende standardisierte Lernpfade für Lehrkräfte",
        ]
      : ["Ineffiziente Prozesse", "Fehlende Standardisierung", "Begrenzte interne Ressourcen"],
    relevantIndustries: isEducation
      ? ["Bildung", "Berufliche Aus- und Weiterbildung", "Maker-Spaces", "Bibliotheken", "Öffentliche Verwaltung"]
      : ["Handel", "Industrie", "Dienstleistungen", "Bildung"],
    buyerRoles: isEducation
      ? ["Schulleitung", "IT-Beauftragte", "Lehrkräfte für MINT-Fächer", "Beschaffung"]
      : ["Einkaufsleitung", "Bereichsleitung", "Geschäftsführung", "Produktmanagement"],
    companyTypes: isEducation
      ? ["Berufsschulen", "Gymnasien", "Hochschulen", "Bildungsträger", "Makerspaces", "FabLabs", "Technikshops"]
      : ["Hersteller", "Distributoren", "Wiederverkäufer", "Großhändler", "Endkunden im Mittelstand"],
    searchTerms: isElectronics
      ? [
          "Arduino Schule Lehrmittel",
          "Elektronik Lernset Berufsschule",
          "Makerspace Schulausstattung",
          "STEM Workshop Material",
          "FabLab Beschaffung Elektronik",
        ]
      : ["B2B Lieferant", "Großkunden Beschaffung", "Branchenvertrieb"],
    competitorOverlap: isElectronics
      ? ["Conrad Education", "fischertechnik", "LEGO Education", "Elektor Lernsets"]
      : [],
    pitchArguments: [
      "Sofort einsatzbereit ohne lange Einarbeitung",
      "Skaliert problemlos vom Pilot zum gesamten Standort",
      "Klare ROI-Argumentation für Beschaffungsentscheider",
    ],
    objections: [
      "Bestehende Lieferantenbeziehungen",
      "Budgetdruck im laufenden Geschäftsjahr",
      "Unklare interne Verantwortlichkeit",
    ],
    searchStrategy:
      "1. Branchen + Region kombinieren (z. B. 'Berufsschule Elektronik NRW'). 2. Impressums-Crawls für Beschaffungsadressen. 3. Maker-Verzeichnisse abklopfen (FabLabs.io, Hackerspace.org). 4. Bildungs-Plattformen prüfen.",
  };
}

function searchQueriesFixture(prompt: string) {
  const region = /DACH|Deutschland|EU|world/i.exec(prompt)?.[0] ?? "Deutschland";
  return {
    queries: [
      { query: `Berufsschulen Elektronik ${region}`, intent: "Kernzielgruppe Bildung" },
      { query: `FabLabs ${region} Elektronik Beschaffung`, intent: "Maker-Communities" },
      { query: `Distributoren Lernmaterial Elektronik ${region}`, intent: "Wiederverkäufer" },
      { query: `Bildungsträger MINT ${region}`, intent: "Erweiterte Zielgruppe" },
      { query: `Technikshops B2B ${region}`, intent: "Reseller" },
    ],
  };
}

function leadRelevanceFixture(prompt: string) {
  const lower = prompt.toLowerCase();
  const fitsEducation = /(schul|berufs|fab|maker|bildung|akademie|universit)/.test(lower);
  return {
    score: fitsEducation ? 82 : 64,
    breakdown: {
      industryFit: fitsEducation ? 22 : 16,
      productFit: 18,
      needSignals: fitsEducation ? 16 : 10,
      contactQuality: 12,
      region: 8,
      strategicValue: fitsEducation ? 6 : 5,
      dataQuality: 5,
    },
    relevanceReason: fitsEducation
      ? "Zielgruppe passt direkt: Bildungseinrichtung mit erkennbarem MINT-Bezug."
      : "Mittelfristig interessant — Profil deutet auf Beschaffungsbedarf, aber kein klarer MINT-Bezug.",
    needSignals: fitsEducation
      ? ["Erwähnt MINT-Schwerpunkt", "Aktive Workshops", "Beschaffung im Impressum öffentlich auffindbar"]
      : ["Allgemeiner B2B-Beschaffungsprozess sichtbar"],
    pitchHook: fitsEducation
      ? "Sofort einsatzbereit für nächste Workshop-Reihe."
      : "ROI in unter 3 Monaten durch Bündelangebot.",
  };
}

function outreachEmailFixture(prompt: string) {
  const company = /Firma:\s*([^\n]+)/i.exec(prompt)?.[1]?.trim() ?? "Ihr Unternehmen";
  return {
    subject: `Kurzer Impuls für ${company}`,
    body: [
      `Guten Tag,`,
      ``,
      `bei der Recherche zu ${company} ist mir Ihr Engagement im Bildungsbereich aufgefallen — speziell die Verbindung von praxisnaher Ausbildung und moderner Technik.`,
      ``,
      `Wir liefern ein einsatzfertiges Elektronik-Lernset, mit dem Lehrkräfte ohne Einarbeitungszeit Workshops zu Mikrocontrollern, Sensorik und IoT umsetzen können — inkl. dokumentierter Lernpfade.`,
      ``,
      `Falls Sie 2026 Material für Ihre MINT-Angebote planen, würde ich Ihnen gerne in 15 Minuten zeigen, wie Kollegen Ihrer Branche damit ihre Vorbereitungszeit halbiert haben.`,
      ``,
      `Beste Grüße,`,
      `Ihr Team von Product2Lead AI`,
    ].join("\n"),
  };
}

function outreachLinkedInFixture(prompt: string) {
  const company = /Firma:\s*([^\n]+)/i.exec(prompt)?.[1]?.trim() ?? "Ihr Unternehmen";
  return {
    body: `Hallo zusammen, beim Blick auf die MINT-Aktivitäten von ${company} ist mir Ihr Workshop-Programm aufgefallen. Falls Sie nach einem einsatzfertigen Elektronik-Lernset suchen, das Vorbereitungsaufwand halbiert — kurz austauschen?`,
  };
}

function outreachFollowupFixture(prompt: string) {
  const company = /Firma:\s*([^\n]+)/i.exec(prompt)?.[1]?.trim() ?? "Ihr Team";
  return {
    subject: `Kurz nachgefragt — ${company}`,
    body: [
      `Guten Tag,`,
      ``,
      `nur ein kurzer Impuls: Ich wollte fragen, ob unser Hinweis zum Elektronik-Lernset bei Ihnen angekommen ist. Falls jetzt nicht der richtige Zeitpunkt ist, freue ich mich über einen Hinweis, wann eine Wiedervorlage passt.`,
      ``,
      `Beste Grüße`,
    ].join("\n"),
  };
}

function outreachPhoneFixture(_prompt: string) {
  return {
    opening: "Guten Tag, mein Name ist [Name] von Product2Lead AI. Ich rufe an, weil mir Ihr MINT-Programm aufgefallen ist — habe ich Sie kurz erreicht?",
    qualifyingQuestions: [
      "Wer ist bei Ihnen aktuell für die Beschaffung von Lernmaterial verantwortlich?",
      "Welche Hürden sehen Sie heute bei der Vorbereitung praktischer Elektronik-Einheiten?",
      "Bis wann müsste eine Lösung greifen, um Ihre nächste Workshop-Reihe abzudecken?",
    ],
    valuePoints: [
      "Einsatzbereit ohne Vorbereitungsaufwand",
      "Dokumentierte Lernpfade",
      "Skalierbar von Pilotklasse bis Schulträger",
    ],
    nextStep: "15-Minuten-Demo per Video oder Versand eines Sample-Sets.",
  };
}

function defaultText(prompt: string): string {
  return `Mock-Antwort:\n\n${prompt.slice(0, 400)}`;
}
