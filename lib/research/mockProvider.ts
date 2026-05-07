import type { CompanyDiscoveryProvider, DiscoveredCompany } from "./types";

/**
 * Realistic mock provider. Returns a curated pool of B2B companies that are
 * obviously fictional but plausible-looking. This keeps the rest of the
 * pipeline (scoring, dedup, outreach) honest until a real provider is wired in.
 */
const POOL: DiscoveredCompany[] = [
  {
    companyName: "FabLab Karlsruhe e.V.",
    website: "https://fablab-karlsruhe-example.de",
    industry: "Maker-Space / Bildung",
    city: "Karlsruhe",
    country: "Deutschland",
    description:
      "Offene Werkstatt mit Workshops für Schulen und Auszubildende. Schwerpunkte 3D-Druck, Elektronik, Mikrocontroller-Programmierung.",
    productsFound: ["Workshops Elektronik", "Schul-Kooperationen", "MINT-Tage"],
    contactEmail: "info@fablab-karlsruhe-example.de",
    contactPhone: "+49 721 0000000",
    contactPageUrl: "https://fablab-karlsruhe-example.de/kontakt",
    imprintUrl: "https://fablab-karlsruhe-example.de/impressum",
    contactPerson: "Vorstand",
    contactRole: "Ansprechpartner Workshops",
    sources: [
      { url: "https://fablab-karlsruhe-example.de", kind: "website", excerpt: "Schul- und Maker-Workshops mit Mikrocontrollern" },
      { url: "https://fablab-karlsruhe-example.de/impressum", kind: "imprint" },
    ],
  },
  {
    companyName: "Berufskolleg Nord Düsseldorf",
    website: "https://berufskolleg-nord-example.de",
    industry: "Bildung",
    city: "Düsseldorf",
    country: "Deutschland",
    description:
      "Berufskolleg mit technischem Schwerpunkt. Bietet Ausbildungen in Elektrotechnik, Mechatronik und IT-Berufen mit jährlich rund 1.200 Lernenden.",
    productsFound: ["Ausbildung Elektrotechnik", "Mechatronik-Werkstatt", "IT-Berufe"],
    contactEmail: "verwaltung@berufskolleg-nord-example.de",
    contactPageUrl: "https://berufskolleg-nord-example.de/kontakt",
    imprintUrl: "https://berufskolleg-nord-example.de/impressum",
    contactPerson: "Schulverwaltung",
    contactRole: "Beschaffung",
    sources: [
      { url: "https://berufskolleg-nord-example.de", kind: "website" },
      { url: "https://berufskolleg-nord-example.de/impressum", kind: "imprint" },
    ],
  },
  {
    companyName: "MakerWerk GmbH",
    website: "https://makerwerk-example.de",
    industry: "Technik-Reseller",
    city: "Leipzig",
    country: "Deutschland",
    description:
      "Distributor für Bildungselektronik und Lernsets. Vertreibt Mikrocontroller, Sensoren und Lehrmaterial an Schulen, Hochschulen und Maker-Communities.",
    productsFound: ["Distribution Lernsets", "B2B-Konditionen Schulen", "Beratung Lehrkräfte"],
    contactEmail: "vertrieb@makerwerk-example.de",
    contactPhone: "+49 341 0000000",
    contactPageUrl: "https://makerwerk-example.de/kontakt",
    imprintUrl: "https://makerwerk-example.de/impressum",
    contactPerson: "Vertriebsleitung",
    contactRole: "B2B-Vertrieb",
    sources: [
      { url: "https://makerwerk-example.de", kind: "website" },
      { url: "https://makerwerk-example.de/impressum", kind: "imprint" },
    ],
  },
  {
    companyName: "Stadtbibliothek Heidelberg — MINT-Lab",
    website: "https://stadtbibliothek-heidelberg-example.de",
    industry: "Öffentliche Hand / Bildung",
    city: "Heidelberg",
    country: "Deutschland",
    description:
      "Stadtbibliothek mit MINT-Lab-Programm: Workshops für Kinder und Jugendliche zu Programmierung, Elektronik und Robotik.",
    productsFound: ["MINT-Workshops", "Coding-Kurse", "Hardware-Verleih"],
    contactEmail: "mint-lab@stadtbibliothek-heidelberg-example.de",
    contactPageUrl: "https://stadtbibliothek-heidelberg-example.de/mint-lab",
    sources: [
      { url: "https://stadtbibliothek-heidelberg-example.de/mint-lab", kind: "website" },
    ],
  },
  {
    companyName: "TechAkademie Süd",
    website: "https://techakademie-sued-example.de",
    industry: "Berufliche Weiterbildung",
    city: "München",
    country: "Deutschland",
    description:
      "Privater Bildungsträger für IT- und Elektronik-Weiterbildung. Anerkannt für Bildungsgutschein und Inhouse-Trainings für Unternehmen.",
    productsFound: ["Weiterbildung Elektronik", "Inhouse-Trainings", "Bildungsgutschein"],
    contactEmail: "info@techakademie-sued-example.de",
    contactPhone: "+49 89 0000000",
    contactPageUrl: "https://techakademie-sued-example.de/kontakt",
    imprintUrl: "https://techakademie-sued-example.de/impressum",
    contactPerson: "Geschäftsführung",
    contactRole: "Programmleitung",
    sources: [
      { url: "https://techakademie-sued-example.de", kind: "website" },
      { url: "https://techakademie-sued-example.de/impressum", kind: "imprint" },
    ],
  },
  {
    companyName: "Hochschule Mittweida — Robotik-Labor",
    website: "https://hs-mittweida-example.de",
    industry: "Hochschule",
    city: "Mittweida",
    country: "Deutschland",
    description:
      "Robotik-Labor mit Fokus auf eingebettete Systeme. Sucht regelmäßig Lernsets für Lehrveranstaltungen.",
    productsFound: ["Lehrveranstaltungen Eingebettete Systeme", "Studentische Projekte"],
    contactEmail: "robotik@hs-mittweida-example.de",
    contactPageUrl: "https://hs-mittweida-example.de/robotik/kontakt",
    sources: [{ url: "https://hs-mittweida-example.de/robotik", kind: "website" }],
  },
  {
    companyName: "Volkshochschule Wien — Digital",
    website: "https://vhs-wien-example.at",
    industry: "Weiterbildung",
    city: "Wien",
    country: "Österreich",
    description:
      "Volkshochschule mit großem Digital-Programm. Bietet Erwachsenenkurse zu Programmierung, Elektronik und IoT.",
    productsFound: ["Programmier-Kurse", "Maker-Workshops"],
    contactEmail: "digital@vhs-wien-example.at",
    contactPageUrl: "https://vhs-wien-example.at/kontakt",
    sources: [{ url: "https://vhs-wien-example.at/digital", kind: "website" }],
  },
  {
    companyName: "Hackerspace Zürich",
    website: "https://hackerspace-zh-example.ch",
    industry: "Maker-Space",
    city: "Zürich",
    country: "Schweiz",
    description:
      "Offener Hackerspace mit Werkstatt, regelmäßigen Workshops und Schulkooperationen. Beschafft Material kollektiv.",
    productsFound: ["Workshops", "Schul-Kooperationen", "Maker-Sets"],
    contactEmail: "hello@hackerspace-zh-example.ch",
    sources: [{ url: "https://hackerspace-zh-example.ch", kind: "website" }],
  },
  {
    companyName: "Industriepark Ost — Ausbildungszentrum",
    website: "https://industriepark-ost-example.de",
    industry: "Industrie / Ausbildung",
    city: "Magdeburg",
    country: "Deutschland",
    description:
      "Verbund-Ausbildungszentrum mehrerer Industriebetriebe. Schulung von Mechatronikern und Elektronikern.",
    productsFound: ["Verbund-Ausbildung", "Werkstattbetrieb"],
    contactEmail: "ausbildung@industriepark-ost-example.de",
    contactPhone: "+49 391 0000000",
    contactPageUrl: "https://industriepark-ost-example.de/ausbildung/kontakt",
    sources: [{ url: "https://industriepark-ost-example.de/ausbildung", kind: "website" }],
  },
  {
    companyName: "ConradEDU Solutions GmbH",
    website: "https://conradedu-example.de",
    industry: "Reseller / Distributor",
    city: "Hirschau",
    country: "Deutschland",
    description:
      "Spezialisierter Distributor für Bildungselektronik. Direktvertrieb an Schulen, Berufsschulen und Universitäten.",
    productsFound: ["Bildungs-Distribution", "Rahmenverträge", "Schulrabatte"],
    contactEmail: "schulvertrieb@conradedu-example.de",
    contactPhone: "+49 9622 0000000",
    contactPageUrl: "https://conradedu-example.de/kontakt",
    imprintUrl: "https://conradedu-example.de/impressum",
    sources: [
      { url: "https://conradedu-example.de", kind: "website" },
      { url: "https://conradedu-example.de/impressum", kind: "imprint" },
    ],
  },
  {
    companyName: "Ausbildungswerkstatt Mittelhessen",
    website: "https://aw-mittelhessen-example.de",
    industry: "Industrie / Ausbildung",
    city: "Gießen",
    country: "Deutschland",
    description:
      "Überbetriebliche Ausbildungswerkstatt. Schwerpunkt Elektronik, IoT-Schulungen für Industrie 4.0.",
    productsFound: ["IoT-Schulung Industrie 4.0", "Elektronik-Module"],
    contactEmail: "info@aw-mittelhessen-example.de",
    sources: [{ url: "https://aw-mittelhessen-example.de", kind: "website" }],
  },
  {
    companyName: "Coding School Berlin gGmbH",
    website: "https://codingschool-berlin-example.de",
    industry: "Bildung",
    city: "Berlin",
    country: "Deutschland",
    description:
      "Gemeinnützige Bildungsorganisation, die Programmier-Camps für Kinder und Jugendliche anbietet — auch hardware-nah.",
    productsFound: ["Coding-Camps", "Hardware-Workshops"],
    contactEmail: "kurse@codingschool-berlin-example.de",
    contactPageUrl: "https://codingschool-berlin-example.de/kontakt",
    sources: [{ url: "https://codingschool-berlin-example.de", kind: "website" }],
  },
];

const ALL_INDUSTRIES = POOL.map((c) => c.industry?.toLowerCase() ?? "");
const ALL_TEXTS = POOL.map((c) =>
  `${c.companyName} ${c.industry ?? ""} ${c.description ?? ""} ${c.productsFound.join(" ")}`.toLowerCase(),
);

export const mockCompanyDiscovery: CompanyDiscoveryProvider = {
  async search({ query, region, limit = 6 }) {
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter((t) => t.length > 2);

    const scored = POOL.map((company, idx) => {
      const text = ALL_TEXTS[idx];
      let score = 0;
      for (const t of tokens) {
        if (text.includes(t)) score += 2;
      }
      if (region) {
        const r = region.toLowerCase();
        if (r === "de" || r.includes("deutschland")) {
          if (company.country === "Deutschland") score += 1;
        } else if (r === "dach") {
          if (["Deutschland", "Österreich", "Schweiz"].includes(company.country ?? "")) score += 1;
        } else if (r === "eu" || r === "world") {
          score += 0.2;
        }
      }
      // Always include the industry signal
      if (ALL_INDUSTRIES[idx].includes("bildung") && /schul|bildung|akademie|education/i.test(query)) {
        score += 1;
      }
      return { company, score };
    })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.company);

    // Always return at least one company so the pipeline has data to work with.
    const result = scored.length === 0 ? POOL.slice(0, Math.min(limit, 3)) : scored;
    // Real public B2B impressums have phone numbers far less often than e-mail
    // addresses. Strip the phone for ~60% of results so the rest of the app
    // realistically deals with leads where Cold Calling isn't an option.
    return result.map((company, idx) => stripPhoneOften(company, idx));
  },
};

function stripPhoneOften(company: DiscoveredCompany, idx: number): DiscoveredCompany {
  // Deterministic: every 5th index keeps the phone, the rest don't. Yields
  // ~20% with-phone, matching what real B2B-website impressums look like.
  if (idx % 5 === 0) return company;
  if (!company.contactPhone) return company;
  const { contactPhone: _drop, ...rest } = company;
  return rest as DiscoveredCompany;
}
