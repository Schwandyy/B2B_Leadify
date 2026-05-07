import type { CompanyDiscoveryProvider } from "./types";
import { mockCompanyDiscovery } from "./mockProvider";
import { crawlerCompanyDiscovery } from "./crawlerProvider";

let cached: CompanyDiscoveryProvider | null = null;

export type ResearchProvider = "mock" | "crawler";

export function getResearchProvider(): ResearchProvider {
  const value = (process.env.RESEARCH_PROVIDER ?? "mock").toLowerCase();
  return value === "crawler" ? "crawler" : "mock";
}

export function getCompanyDiscoveryProvider(): CompanyDiscoveryProvider {
  if (cached) return cached;
  switch (getResearchProvider()) {
    case "crawler":
      cached = crawlerCompanyDiscovery;
      break;
    default:
      cached = mockCompanyDiscovery;
  }
  return cached;
}
