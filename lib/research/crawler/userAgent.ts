/**
 * Identifies our crawler transparently. Real-world etiquette: include
 * a name + a contact path so site owners know who's hitting them.
 */
export const CRAWLER_USER_AGENT =
  "Product2LeadAI-Researcher/0.1 (+https://product2lead.example/contact; non-commercial B2B research; respects robots.txt)";

export const CRAWLER_HEADERS: Record<string, string> = {
  "User-Agent": CRAWLER_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
};
