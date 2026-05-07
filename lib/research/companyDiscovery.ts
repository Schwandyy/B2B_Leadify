import type { CompanyDiscoveryProvider } from "./types";
import { mockCompanyDiscovery } from "./mockProvider";

let cached: CompanyDiscoveryProvider | null = null;

export function getCompanyDiscoveryProvider(): CompanyDiscoveryProvider {
  if (cached) return cached;
  const provider = (process.env.RESEARCH_PROVIDER ?? "mock").toLowerCase();
  switch (provider) {
    case "mock":
    default:
      cached = mockCompanyDiscovery;
  }
  return cached;
}
