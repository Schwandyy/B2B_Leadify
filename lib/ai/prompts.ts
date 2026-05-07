/**
 * Central prompt registry. All templates versioned via PROMPT_VERSION
 * so runs can be reproduced and audited.
 */
export const PROMPT_VERSION = "2026-05-07.1";

export const SYSTEM_PROMPT_DE = [
  "Du bist ein Senior B2B Sales Strategist und Recherche-Analyst.",
  "Sprache: Deutsch.",
  "Lieferprinzip: präzise, produktnah, aktionsorientiert.",
  "VERBOTEN:",
  "- Marketing-Floskeln ('innovativ', 'zukunftssicher', 'Sie können …')",
  "- Allgemeine Phrasen, die für 80% aller Produkte gelten würden",
  "- Erfundene Quellen, Marken, Zahlen, Kunden",
  "- Schulen / Maker als Default-Antwort, wenn das Produkt offenkundig nicht dafür ist",
  "PFLICHT:",
  "- Konkret auf das beschriebene Produkt eingehen — Fachbegriffe aus der Beschreibung übernehmen",
  "- Branchen / Käufer / Anwendungsfälle aus den technischen Daten ableiten, nicht aus Bauchgefühl",
  "- Wenn die Beschreibung dünn ist, das ehrlich vermerken statt zu fabulieren",
].join("\n");

export type ProductInput = {
  name: string;
  description: string;
  productUrl?: string | null;
  category?: string | null;
  targetRegion?: string | null;
  targetCustomerTypes: string[];
  keywords: string[];
  exclusions: string[];
  priceRange?: string | null;
};

function formatProduct(p: ProductInput): string {
  const lines = [
    `Produkt: ${p.name}`,
    `Beschreibung: ${p.description}`,
    p.productUrl ? `Produktlink: ${p.productUrl}` : null,
    p.category ? `Kategorie: ${p.category}` : null,
    p.targetRegion ? `Zielregion: ${p.targetRegion}` : null,
    p.targetCustomerTypes.length ? `Zielkundentyp: ${p.targetCustomerTypes.join(", ")}` : null,
    p.keywords.length ? `Keywords: ${p.keywords.join(", ")}` : null,
    p.exclusions.length ? `Ausschlüsse: ${p.exclusions.join(", ")}` : null,
    p.priceRange ? `Preisbereich: ${p.priceRange}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export const productAnalysisPrompt = {
  schemaName: "ProductAnalysis",
  schemaHint: `{
  "shortDescription": string,
  "valueProposition": string,
  "problemsSolved": string[],
  "relevantIndustries": string[],
  "buyerRoles": string[],
  "companyTypes": string[],
  "searchTerms": string[],
  "competitorOverlap": string[],
  "pitchArguments": string[],
  "objections": string[],
  "searchStrategy": string
}`,
  build(p: ProductInput): string {
    return [
      "Analysiere das folgende Produkt für eine B2B-Akquise-Strategie.",
      "Lies die Produktbeschreibung GENAU und beziehe dich in jedem Feld der Antwort auf konkrete technische Eigenschaften.",
      "",
      "Vorgehen pro Feld:",
      "- shortDescription: 1 Satz, was das Produkt technisch ist (kein Marketing).",
      "- valueProposition: 1 Satz Nutzen für einen B2B-Käufer, nicht für einen Endkunden.",
      "- problemsSolved: 3-5 konkrete Probleme, die DAS PRODUKT laut Spezifikation löst (keine Floskeln).",
      "- relevantIndustries: branchenspezifische Begriffe, abgeleitet aus technischer Funktion (z. B. bei OLED-Display: Industrie-HMI, Medizingeräte-Hersteller, IoT-Anbieter — NICHT pauschal 'Bildung').",
      "- buyerRoles: konkrete Einkäufer-/Engineering-Rollen, die das Bauteil/Produkt einkaufen würden.",
      "- companyTypes: Firmenarten, die DIESES spezifische Bauteil verbauen oder weiterverkaufen.",
      "- searchTerms: 5-8 Suchbegriffe, mit denen man echte Käufer finden kann (deutsche B2B-Welt).",
      "- competitorOverlap: andere Marken/Hersteller, die ein ähnliches Bauteil herstellen.",
      "- pitchArguments: 3 Verkaufsargumente, die NUR für dieses Produkt stimmen.",
      "- objections: 2-3 Einwände, die ein Einkäufer hier wirklich vorbringen würde.",
      "- searchStrategy: konkreter 3-Schritte-Plan, wie man Käufer findet — keine Allgemeinplätze.",
      "",
      formatProduct(p),
    ].join("\n");
  },
};

export const searchQueriesPrompt = {
  schemaName: "SearchQueries",
  schemaHint: `{ "queries": Array<{ "query": string, "intent": string }> }`,
  build(p: ProductInput, analysisSummary: string): string {
    return [
      "Erstelle 6-10 konkrete, suchmaschinen-taugliche Suchanfragen, die helfen, B2B-Käufer für dieses Produkt zu finden.",
      "Mische Branchen-, Rollen-, und Beschaffungs-orientierte Anfragen. Region beachten.",
      "",
      formatProduct(p),
      "",
      `Analyse-Auszug: ${analysisSummary}`,
    ].join("\n");
  },
};

export const leadRelevancePrompt = {
  schemaName: "LeadRelevance",
  schemaHint: `{
  "score": number, // 0-100
  "breakdown": { "industryFit": number, "productFit": number, "needSignals": number, "contactQuality": number, "region": number, "strategicValue": number, "dataQuality": number },
  "relevanceReason": string,
  "needSignals": string[],
  "pitchHook": string
}`,
  build(args: {
    product: ProductInput;
    company: {
      name: string;
      website?: string | null;
      industry?: string | null;
      country?: string | null;
      description?: string | null;
      hasContact: boolean;
    };
  }): string {
    const { product, company } = args;
    return [
      "Bewerte die Relevanz des folgenden Unternehmens als Lead für das Produkt. Score 0-100.",
      "Begründe knapp und nenne konkrete Bedarfssignale. Keine Halluzinationen.",
      "",
      formatProduct(product),
      "",
      `Firma: ${company.name}`,
      company.website ? `Website: ${company.website}` : "",
      company.industry ? `Branche: ${company.industry}` : "",
      company.country ? `Land: ${company.country}` : "",
      company.description ? `Beschreibung: ${company.description}` : "",
      `Öffentlicher Kontakt verfügbar: ${company.hasContact ? "ja" : "nein"}`,
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export const outreachEmailPrompt = {
  schemaName: "OutreachEmail",
  schemaHint: `{ "subject": string, "body": string }`,
  build(args: {
    product: ProductInput;
    company: { name: string; industry?: string | null; needSignals: string[]; relevanceReason?: string | null };
  }): string {
    const { product, company } = args;
    return [
      "Schreibe eine seriöse, knappe B2B-Akquise-Mail (max. 140 Worte) auf Deutsch.",
      "- Konkreter Bezug zum Unternehmen, kein generisches Lob",
      "- Klarer Nutzen in einem Satz",
      "- Weicher Call-to-Action, kein Verkaufsdruck",
      "- Keine ALLES-IN-CAPS, keine Emoji",
      "",
      formatProduct(product),
      "",
      `Firma: ${company.name}`,
      company.industry ? `Branche: ${company.industry}` : "",
      company.needSignals.length ? `Bedarfssignale: ${company.needSignals.join("; ")}` : "",
      company.relevanceReason ? `Relevanz: ${company.relevanceReason}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export const outreachLinkedInPrompt = {
  schemaName: "OutreachLinkedIn",
  schemaHint: `{ "body": string }`,
  build(args: { product: ProductInput; company: { name: string; industry?: string | null } }): string {
    return [
      "Schreibe eine LinkedIn-Erstkontakt-Nachricht (max. 60 Worte). Höflich, kurz, mit Bezug.",
      "",
      formatProduct(args.product),
      "",
      `Firma: ${args.company.name}`,
      args.company.industry ? `Branche: ${args.company.industry}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export const outreachFollowupPrompt = {
  schemaName: "OutreachFollowup",
  schemaHint: `{ "subject": string, "body": string }`,
  build(args: { product: ProductInput; company: { name: string } }): string {
    return [
      "Erzeuge eine Follow-up-Mail (max. 100 Worte) — höflich, ohne Druck, mit konkretem Mehrwert oder einer einzelnen Frage.",
      "",
      formatProduct(args.product),
      "",
      `Firma: ${args.company.name}`,
    ].join("\n");
  },
};

export const outreachPhonePrompt = {
  schemaName: "OutreachPhoneScript",
  schemaHint: `{
  "opening": string,
  "qualifyingQuestions": string[],
  "valuePoints": string[],
  "nextStep": string
}`,
  build(args: { product: ProductInput; company: { name: string; industry?: string | null } }): string {
    return [
      "Erstelle einen Telefon-Gesprächsleitfaden für eine B2B-Erstanrufe (Cold Call).",
      "",
      formatProduct(args.product),
      "",
      `Firma: ${args.company.name}`,
      args.company.industry ? `Branche: ${args.company.industry}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  },
};
