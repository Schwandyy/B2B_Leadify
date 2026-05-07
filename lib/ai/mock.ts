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
  // Extract concrete product signals from the description — used to make the
  // mock answer more product-specific instead of always returning "schools/makers".
  const text = prompt.toLowerCase();

  type Profile = {
    short: (h: { name: string }) => string;
    industries: string[];
    buyerRoles: string[];
    companyTypes: string[];
    searchSeeds: string[];
    competitors: string[];
  };

  const profiles: Array<{ match: RegExp; profile: Profile }> = [
    {
      match: /\boled\b|tft|lcd|display|bildschirm/,
      profile: {
        short: (h) => `${h.name} — kompaktes Anzeigedisplay-Modul für eingebettete Systeme.`,
        industries: [
          "Industrie-HMI / Maschinenbau",
          "Medizintechnik (kleine Gerätedisplays)",
          "IoT-Hardware / Smart-Home-OEMs",
          "Test- und Messgerätebau",
          "Hobby-Elektronik / Reseller",
        ],
        buyerRoles: ["Hardware-Engineering", "Embedded-Entwickler:innen", "Einkauf Elektronik", "Produktentwicklung"],
        companyTypes: ["HMI-Hersteller", "OEM-Geräteentwickler", "Steuerungsbauer", "Elektronik-Distributoren", "EMS-Dienstleister"],
        searchSeeds: ["I2C OLED Hersteller", "Display Modul Beschaffung", "Embedded Anzeige Lieferant", "HMI Komponenten Distributor"],
        competitors: ["Adafruit", "Waveshare", "Sparkfun", "Reichelt"],
      },
    },
    {
      match: /sensor|messung|temperatur|feuchtigkeit|gas|druck/,
      profile: {
        short: (h) => `${h.name} — Sensor-Komponente für Mess- und Steuerungsanwendungen.`,
        industries: ["Gebäudeautomation", "Industrieautomation", "Klima-/Lüftungstechnik", "Smart-Building", "Landwirtschaft / Agrartechnik"],
        buyerRoles: ["Anlagenbauer", "Automatisierungsplaner", "Einkauf Gebäudetechnik", "F&E Embedded"],
        companyTypes: ["Anlagenbauer", "MSR-Dienstleister", "GLT-Integratoren", "Gebäudetechnik-Distributoren", "Agrartechnik-Hersteller"],
        searchSeeds: ["Sensorik Distributor", "Messtechnik B2B Lieferant", "Smart-Building Komponenten", "Industriesensor Großkunde"],
        competitors: ["Sensirion-Distributoren", "B+B Thermotechnik", "Conrad Business"],
      },
    },
    {
      match: /raspberry|arduino|esp|esp32|esp8266|microcontroller|mcu|mikrocontroller/,
      profile: {
        short: (h) => `${h.name} — Mikrocontroller- bzw. SBC-Komponente für eigene Hardwareprojekte.`,
        industries: ["Embedded-OEMs", "IoT-Geräteentwickler", "Industrie 4.0", "Robotik / Automatisierung", "Forschungseinrichtungen"],
        buyerRoles: ["Embedded-Entwickler:innen", "Hardware-Architekten", "Einkauf Komponenten", "Innovations-/F&E-Leitung"],
        companyTypes: ["IoT-Startups", "Embedded-EMS", "Robotik-Hersteller", "Universitätsinstitute / FH", "Engineering-Dienstleister"],
        searchSeeds: ["ESP32 Distributor B2B", "Embedded Komponenten Großkunde", "IoT Hardware Lieferant", "Mikrocontroller Großmenge"],
        competitors: ["Mouser", "Digikey", "Farnell", "Reichelt"],
      },
    },
    {
      match: /relais|relay|optokoppler|leistungselektronik|treiber|driver/,
      profile: {
        short: (h) => `${h.name} — Schalt- bzw. Leistungselektronik-Komponente für Steuerungen.`,
        industries: ["Maschinenbau", "Elektrotechnik / Schaltschrankbau", "Gebäudeleittechnik", "Industrieautomation"],
        buyerRoles: ["Steuerungstechniker:innen", "Schaltschrankbauer", "Einkauf Elektrotechnik", "Anlagenbau-Engineering"],
        companyTypes: ["Schaltanlagenbauer", "Elektroinstallateure (Industrie)", "MSR-Integratoren", "Schaltschrank-Distributoren"],
        searchSeeds: ["Relais Modul Schaltschrank", "Industriesteuerung Komponenten", "Schaltschrank Distributor"],
        competitors: ["Phoenix Contact", "Wago-Distributoren", "Finder"],
      },
    },
    {
      match: /motor|servo|stepper|schrittmotor|antrieb/,
      profile: {
        short: (h) => `${h.name} — Antriebskomponente für Bewegungs- und Robotik-Anwendungen.`,
        industries: ["Robotik", "Sondermaschinenbau", "Modellbau / Prototyping", "Industrieautomation"],
        buyerRoles: ["Mechatroniker", "Konstruktion Sondermaschinenbau", "Einkauf Antriebstechnik"],
        companyTypes: ["Robotik-OEMs", "Sondermaschinenbau", "Antriebstechnik-Distributoren", "Prototyping-Dienstleister"],
        searchSeeds: ["Schrittmotor Antriebstechnik B2B", "Robotik Komponenten Distributor", "Servo Ersatzteile Großkunde"],
        competitors: ["Trinamic", "Faulhaber", "Nanotec"],
      },
    },
    {
      match: /kabel|flexkabel|adapter|stecker|breakout/,
      profile: {
        short: (h) => `${h.name} — Verbindungs-/Adapterkomponente für Hardware-Aufbauten.`,
        industries: ["Industrie 4.0", "Embedded-Entwicklung", "Service- und Reparaturbetriebe", "Prototyping-Werkstätten"],
        buyerRoles: ["Service-/Reparatur-Einkauf", "Engineering-Werkstätten", "Embedded-Entwicklung"],
        companyTypes: ["Reparatur-Dienstleister", "Engineering-Büros", "EMS-Dienstleister", "Distributoren für Connectivity"],
        searchSeeds: ["Flachbandkabel Distributor", "Adapter B2B Lieferant", "Stecker Industrie Beschaffung"],
        competitors: ["Conrad Business", "TME"],
      },
    },
    {
      match: /solarpanel|solar|panel|wechselrichter|laderegler/,
      profile: {
        short: (h) => `${h.name} — Komponente aus dem Bereich Solar / Energie.`,
        industries: ["Solarteur-Betriebe", "Camping-/Mobile-Energie-Händler", "Off-Grid-Installateure", "Großhandel Energie"],
        buyerRoles: ["Einkauf Solarteure", "Vertriebsleitung Camping-/Outdoor-Handel", "Großhandel Energie"],
        companyTypes: ["Solarinstallateure", "Wohnmobil-/Camping-Händler", "Off-Grid-Spezialisten", "Energie-Distributoren"],
        searchSeeds: ["Solarmodul B2B Distributor", "Camping Solar Großhandel", "Off-Grid Komponenten Lieferant"],
        competitors: ["Offgridtec", "ECTIVE", "Renogy"],
      },
    },
  ];

  const heuristicName = extractAfter(text, "produkt:")?.split(/\n/)[0]?.trim() ?? "Dieses Produkt";
  const matched = profiles.find((p) => p.match.test(text)) ?? null;
  const profile: Profile =
    matched?.profile ?? {
      short: (h) => `${h.name} — Industrie-/Elektronik-Bauteil für eingebettete Anwendungen.`,
      industries: ["Embedded-OEMs", "Industrie-Distributoren", "Engineering-Dienstleister", "Reparatur-/Servicebetriebe"],
      buyerRoles: ["Hardware-Einkauf", "Engineering", "Service-Werkstatt"],
      companyTypes: ["Embedded-OEMs", "EMS-Dienstleister", "Distributoren", "Engineering-Büros"],
      searchSeeds: ["Elektronik-Komponente B2B", "Industriebauteil Distributor", "Engineering-Dienstleister"],
      competitors: [],
    };

  return {
    shortDescription: profile.short({ name: heuristicName }),
    valueProposition: `Reduziert Time-to-Prototype/Time-to-Market im Vergleich zur Eigenkonstruktion durch sofort verfügbares, dokumentiertes Standard-Bauteil.`,
    problemsSolved: [
      "Lange Lieferzeiten für Spezialkomponenten in Kleinmengen",
      "Hoher Engineering-Aufwand für triviale Hardware-Bausteine",
      "Inkonsistente Qualität bei mehrfachen Bezugsquellen",
    ],
    relevantIndustries: profile.industries,
    buyerRoles: profile.buyerRoles,
    companyTypes: profile.companyTypes,
    searchTerms: profile.searchSeeds,
    competitorOverlap: profile.competitors,
    pitchArguments: [
      "Lagerverfügbar, klar dokumentiert, mit Datenblatt",
      "Skaliert problemlos von Prototyp zur Serie",
      "Direkter Kontakt zum Hersteller statt anonymem Marktplatz",
    ],
    objections: [
      "Bestehende Lieferantenrahmenverträge",
      "Vorgabe interner Lieferantennummern / Onboarding-Prozess",
      "Stückpreisspanne im Vergleich zu chinesischen Spotmarkt-Quellen",
    ],
    searchStrategy:
      "1. Branchen-spezifische Suchqueries kombinieren (z. B. 'HMI Hersteller DACH'). 2. Impressums-/Kontaktseiten von OEMs und Distributoren crawlen. 3. Engineering-Verzeichnisse (Produktion.de, IndustryStock) abklopfen.",
  };
}

function extractAfter(text: string, marker: string): string | undefined {
  const idx = text.indexOf(marker);
  if (idx < 0) return undefined;
  return text.slice(idx + marker.length).trim();
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
