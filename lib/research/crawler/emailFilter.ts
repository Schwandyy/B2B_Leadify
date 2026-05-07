/**
 * Whitelist of "role" mailbox local-parts that are unambiguously generic
 * and mean a department, not a person. We only keep these — anything else
 * (looks-like-firstname.lastname@…) is dropped to stay DSGVO-friendly.
 */
const GENERIC_LOCAL_PARTS = new Set([
  "info",
  "kontakt",
  "contact",
  "vertrieb",
  "sales",
  "office",
  "service",
  "mail",
  "hello",
  "einkauf",
  "purchase",
  "purchasing",
  "support",
  "help",
  "presse",
  "press",
  "media",
  "marketing",
  "communications",
  "verwaltung",
  "admin",
  "buchhaltung",
  "finance",
  "rechnungen",
  "billing",
  "personal",
  "hr",
  "jobs",
  "career",
  "careers",
  "team",
  "shop",
  "buero",
  "büro",
  "verkauf",
  "anfrage",
  "anfragen",
  "request",
  "inquiry",
  "newsletter",
  "events",
  "veranstaltungen",
  "vertretung",
  "geschaeftsstelle",
  "geschäftsstelle",
  "b2b",
  "business",
  "unternehmen",
  "partner",
  "partners",
  "mailbox",
  "post",
  "empfang",
  "reception",
  "datenschutz",
  "privacy",
  "compliance",
  "legal",
  "recht",
  "leitung",
  "geschaeftsleitung",
  "geschäftsleitung",
  "schulvertrieb",
  "bildung",
  "education",
  "wholesale",
  "retail",
]);

/** Some role-like prefixes also count, even with an extra suffix (e.g. info-de@). */
const GENERIC_PREFIXES = ["info", "kontakt", "vertrieb", "sales", "service", "support", "presse", "marketing"];

export function isGenericBusinessEmail(email: string): boolean {
  const m = email.toLowerCase().match(/^([^@]+)@/);
  if (!m) return false;
  const local = m[1];
  if (GENERIC_LOCAL_PARTS.has(local)) return true;
  // Allow info-de, info_at, kontakt2024, sales-eu etc.
  for (const p of GENERIC_PREFIXES) {
    if (local === p) return true;
    if (local.startsWith(`${p}-`) || local.startsWith(`${p}_`) || local.startsWith(`${p}.`)) {
      const suffix = local.slice(p.length + 1);
      // Suffix must look short + non-personal (e.g. "de", "2024", "team", "eu").
      if (suffix.length <= 8 && !/[A-Za-z]{4,}\.[A-Za-z]{2,}/.test(local)) return true;
    }
  }
  return false;
}

/**
 * Strict filter: returns emails whose local-part is in the generic role
 * whitelist. Everything else (likely personal) is dropped on purpose.
 */
export function filterGenericEmails(emails: string[]): string[] {
  const out = new Set<string>();
  for (const raw of emails) {
    const e = raw.toLowerCase().trim();
    if (!/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) continue;
    if (isGenericBusinessEmail(e)) out.add(e);
  }
  return Array.from(out);
}
