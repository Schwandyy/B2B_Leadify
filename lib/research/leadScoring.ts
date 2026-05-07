import type { ProductAnalysisJson } from "@/lib/ai/productAnalysisService";
import type { DiscoveredCompany } from "./types";

export type ScoreBreakdown = {
  industryFit: number;     // 0..25
  productFit: number;      // 0..20
  needSignals: number;     // 0..20
  contactQuality: number;  // 0..15
  region: number;          // 0..10
  strategicValue: number;  // 0..5
  dataQuality: number;     // 0..5
};

export type ScoreResult = {
  total: number;
  breakdown: ScoreBreakdown;
  reason: string;
  needSignals: string[];
  dataQuality: "HIGH" | "MEDIUM" | "LOW";
};

const MAX = {
  industryFit: 25,
  productFit: 20,
  needSignals: 20,
  contactQuality: 15,
  region: 10,
  strategicValue: 5,
  dataQuality: 5,
} as const;

function hasAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => n && h.includes(n.toLowerCase()));
}

export function scoreLead(args: {
  product: { targetRegion?: string | null; targetCustomerTypes: string[]; keywords: string[] };
  analysis: ProductAnalysisJson | null;
  company: DiscoveredCompany;
}): ScoreResult {
  const { company, analysis } = args;
  const text = `${company.companyName} ${company.industry ?? ""} ${company.description ?? ""} ${company.productsFound.join(" ")}`;
  const reasons: string[] = [];
  const signals: string[] = [];

  // industryFit
  let industryFit = 0;
  if (analysis?.relevantIndustries.length) {
    const hits = analysis.relevantIndustries.filter((ind) => hasAny(text, [ind])).length;
    industryFit = Math.min(MAX.industryFit, hits * 8 + (company.industry ? 5 : 0));
    if (hits) reasons.push(`Branche passt zu Zielsegmenten (${hits})`);
  } else {
    industryFit = company.industry ? 10 : 5;
  }

  // productFit
  let productFit = 0;
  if (args.product.keywords.length) {
    const hits = args.product.keywords.filter((kw) => hasAny(text, [kw])).length;
    productFit = Math.min(MAX.productFit, hits * 5);
    if (hits) reasons.push(`Keywords im Profil (${hits})`);
  }
  if (analysis?.companyTypes.some((ct) => hasAny(text, [ct]))) {
    productFit = Math.min(MAX.productFit, productFit + 6);
    reasons.push("Firmentyp passt");
  }

  // needSignals — collected from products/services found
  const productsText = company.productsFound.join(" ");
  const matched = (analysis?.problemsSolved ?? [])
    .concat(analysis?.searchTerms ?? [])
    .filter((s) => hasAny(productsText, [s]));
  const needSignalsScore = Math.min(MAX.needSignals, matched.length * 5 + (company.productsFound.length > 0 ? 4 : 0));
  if (matched.length) {
    signals.push(...matched.slice(0, 4));
    reasons.push(`Erkannte Bedarfssignale: ${matched.slice(0, 3).join(", ")}`);
  }
  if (company.productsFound.length && signals.length === 0) {
    signals.push(...company.productsFound.slice(0, 3));
  }

  // contactQuality
  let contactQuality = 0;
  if (company.contactEmail) contactQuality += 6;
  if (company.contactPhone) contactQuality += 4;
  if (company.contactPageUrl) contactQuality += 2;
  if (company.imprintUrl) contactQuality += 2;
  if (company.contactPerson) contactQuality += 1;
  contactQuality = Math.min(MAX.contactQuality, contactQuality);

  // region
  let region = 0;
  const target = (args.product.targetRegion ?? "").toLowerCase();
  if (!target || target === "world") {
    region = 6;
  } else if (target === "de" || target.includes("deutschland")) {
    region = company.country === "Deutschland" ? 10 : 2;
  } else if (target === "dach") {
    region = ["Deutschland", "Österreich", "Schweiz"].includes(company.country ?? "") ? 10 : 3;
  } else if (target === "eu") {
    region = company.country ? 8 : 4;
  } else {
    region = 5;
  }

  // strategicValue
  let strategicValue = 0;
  if (/distributor|reseller|großh|großkunde|verband|ausbildung/i.test(`${company.industry ?? ""} ${company.description ?? ""}`)) {
    strategicValue = 5;
    reasons.push("Strategischer Multiplikator");
  } else if (/akademie|hochschule|berufs|fab|maker/i.test(`${company.industry ?? ""} ${company.description ?? ""}`)) {
    strategicValue = 3;
  } else {
    strategicValue = 1;
  }

  // dataQuality
  let dataQualityScore = 0;
  if (company.website) dataQualityScore += 2;
  if (company.sources.length >= 2) dataQualityScore += 2;
  if (company.contactEmail || company.contactPhone) dataQualityScore += 1;
  dataQualityScore = Math.min(MAX.dataQuality, dataQualityScore);

  const total =
    industryFit + productFit + needSignalsScore + contactQuality + region + strategicValue + dataQualityScore;

  const dataQuality: "HIGH" | "MEDIUM" | "LOW" =
    dataQualityScore >= 4 && contactQuality >= 8 ? "HIGH" : dataQualityScore >= 2 ? "MEDIUM" : "LOW";

  if (reasons.length === 0) {
    reasons.push("Allgemeines B2B-Profil ohne klare Signale.");
  }

  return {
    total: Math.min(100, Math.max(0, Math.round(total))),
    breakdown: {
      industryFit,
      productFit,
      needSignals: needSignalsScore,
      contactQuality,
      region,
      strategicValue,
      dataQuality: dataQualityScore,
    },
    reason: reasons.join(". "),
    needSignals: signals,
    dataQuality,
  };
}
