import * as cheerio from "cheerio";
import { filterGenericEmails } from "./emailFilter";

/**
 * Parse impressum/contact HTML to public B2B contact data. The regex layer
 * keeps it provider-agnostic — works for any German Impressum format.
 */

export type ImprintFields = {
  emails: string[];                  // generic-only (info@, vertrieb@ …)
  phones: string[];
  postalAddress?: string;            // multi-line, single string
  city?: string;
  country?: string;
  companyName?: string;              // best guess from Impressum text
  zipCode?: string;
};

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Phone numbers — international + common German formats.
const PHONE_RE =
  /(?:(?:\+|00)\s*\d{1,3}[\s.\-/()]*)?(?:0\s*\d{2,5}[\s.\-/()]*)?\d{2,5}[\s.\-/()]*\d{2,5}(?:[\s.\-/()]*\d{2,8})?/g;

const ZIP_CITY_RE = /\b(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]+){0,3})\b/;

// City words we never want to accept as city — they're labels accidentally
// adjacent to a 5-digit number elsewhere in the text.
const NON_CITY_TOKENS = new Set([
  "e-mail",
  "email",
  "tel",
  "telefon",
  "fax",
  "phone",
  "ust",
  "umsatzsteuer",
  "registergericht",
  "amtsgericht",
  "deutschland",
  "germany",
  "datenschutz",
  "impressum",
  "kontakt",
  "uid",
  "iban",
  "bic",
  "internet",
  "homepage",
  "web",
]);

export function parseImprintHtml(html: string): ImprintFields {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, header, footer nav").remove();
  const text = collapseWhitespace($("body").text());

  const emails = extractEmails(text, $);
  const phones = extractPhones(text);

  const zipMatch = findZipCityMatch(text);
  const zipCode = zipMatch?.[1];
  const city = zipMatch?.[2]?.split(/\s+/)[0];

  const country = guessCountryFromText(text);
  const companyName = guessCompanyName(text);
  const postalAddress = extractPostalAddress(text, zipMatch?.[0] ?? undefined);

  return {
    emails: filterGenericEmails(emails),
    phones: dedupAndSanitisePhones(phones),
    postalAddress,
    city,
    zipCode,
    country,
    companyName,
  };
}

function collapseWhitespace(s: string): string {
  return s.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
}

function findZipCityMatch(text: string): RegExpMatchArray | null {
  const regex = new RegExp(ZIP_CITY_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const cityFirstWord = m[2].split(/\s+/)[0]?.toLowerCase();
    if (cityFirstWord && !NON_CITY_TOKENS.has(cityFirstWord)) return m;
  }
  return null;
}

function extractEmails(text: string, $: cheerio.CheerioAPI): string[] {
  const out = new Set<string>();
  // mailto: links are most reliable
  $("a[href^='mailto:']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.replace(/^mailto:/i, "").split(/[?,]/)[0].trim();
    if (m) out.add(m.toLowerCase());
  });
  // Plain text — handles "info (at) example.de" stylings too
  const normalised = text
    .replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s*\[at\]\s*/gi, "@")
    .replace(/\s+@\s+/g, "@")
    .replace(/\s*\(dot\)\s*/gi, ".")
    .replace(/\s*\[dot\]\s*/gi, ".");
  const matches = normalised.match(EMAIL_RE) ?? [];
  for (const m of matches) out.add(m.toLowerCase());
  return Array.from(out);
}

function extractPhones(text: string): string[] {
  const out = new Set<string>();
  // Only count numbers that follow an explicit label — avoids matching ZIP
  // codes, dates, house numbers, or anything else that "looks numeric".
  const labelled = /(?:tel(?:efon)?|phone|fon|tel\.|t\.\s*:)\s*[:.]?\s*([+\d][\d\s().\-/]{6,})/gi;
  let m: RegExpExecArray | null;
  while ((m = labelled.exec(text)) !== null) {
    const cleaned = sanitisePhone(m[1]);
    if (cleaned) out.add(cleaned);
  }
  return Array.from(out);
}

function sanitisePhone(raw: string): string | null {
  const trimmed = raw.replace(/[^\d+]/g, "");
  // Reject obvious garbage: ZIPs, house numbers, year/order numbers.
  if (trimmed.length < 8) return null;
  if (trimmed.length > 20) return null;
  // Must look phone-shaped: lead with "+" / "00" / "0" / "(0" / "(+".
  if (!/^(\+|00|0|\(\+|\(0)/.test(trimmed)) return null;
  return raw.replace(/\s+/g, " ").trim();
}

function dedupAndSanitisePhones(numbers: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of numbers) {
    const key = n.replace(/[^\d+]/g, "");
    if (key.length < 7) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function guessCountryFromText(text: string): string | undefined {
  if (/\b(deutschland|germany)\b/i.test(text)) return "Deutschland";
  if (/\b(österreich|austria|oesterreich)\b/i.test(text)) return "Österreich";
  if (/\b(schweiz|switzerland)\b/i.test(text)) return "Schweiz";
  return undefined;
}

function guessCompanyName(text: string): string | undefined {
  // German Impressum usually starts with the company name + legal form.
  const m = text.match(/(?:Anbieter|Betreiber)[^A-Za-z0-9]{0,20}([A-ZÄÖÜ][\w&.\-\s]{2,80}?(?:GmbH|AG|UG|GbR|KG|OHG|e\.K\.|e\.V\.|Co\. KG|GmbH & Co\. KG))/);
  if (m?.[1]) return m[1].trim();
  // Fallback: first occurrence of "Name + Rechtsform"
  const m2 = text.match(/([A-ZÄÖÜ][\wäöüß&.\-\s]{2,80}?)\s+(GmbH|AG|UG|GbR|KG|OHG|e\.K\.|e\.V\.|Co\. KG|GmbH & Co\. KG)\b/);
  if (m2?.[0]) return m2[0].trim();
  return undefined;
}

function extractPostalAddress(text: string, zipCityMatch?: string): string | undefined {
  if (!zipCityMatch) return undefined;
  // Try to find a street line right before the zip+city: "Musterstr. 1"
  const i = text.indexOf(zipCityMatch);
  if (i < 0) return undefined;
  const before = text.slice(Math.max(0, i - 80), i).trim();
  const streetMatch = before.match(/([A-ZÄÖÜ][\wäöüß.\- ]{2,40}\s+\d+\s*[a-zA-Z]?)$/);
  if (streetMatch) return `${streetMatch[1].trim()}, ${zipCityMatch}`.replace(/\s+/g, " ");
  return zipCityMatch;
}
