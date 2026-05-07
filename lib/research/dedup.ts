/**
 * Canonical dedup key: lower-cased eTLD+1 of the website. Falls back to
 * normalised company name when no website is available.
 */
export function dedupKey(args: { website?: string | null; companyName: string }): string {
  if (args.website) {
    try {
      const url = new URL(args.website.startsWith("http") ? args.website : `https://${args.website}`);
      return url.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      // fall through
    }
  }
  return args.companyName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
