// Public-only B2B contact data — every field is meant to be obtainable from
// a public website (impressum, contact page, directory).
export interface DiscoveredCompany {
  companyName: string;
  website?: string;
  industry?: string;
  city?: string;
  country?: string;
  description?: string;
  productsFound: string[];
  contactEmail?: string;
  contactPhone?: string;
  contactPageUrl?: string;
  imprintUrl?: string;
  contactPerson?: string;
  contactRole?: string;
  sources: Array<{ url: string; kind: string; excerpt?: string }>;
}

export interface CompanyDiscoveryProvider {
  /**
   * Find candidate companies that match the given query. Implementations
   * MUST respect robots.txt and rate limits (mock obviously doesn't need to).
   */
  search(args: {
    query: string;
    region?: string | null;
    limit?: number;
  }): Promise<DiscoveredCompany[]>;
}
