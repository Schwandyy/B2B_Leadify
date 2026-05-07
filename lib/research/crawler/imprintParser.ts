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

// TLD-whitelist makes the regex non-greedy across glued text — without this,
// "info@x.deabonnentenbetreuung" would match as if the TLD were "deabonnen…".
const ALLOWED_TLD = "(?:de|com|at|ch|net|org|eu|info|io|shop|store|app|gmbh|ag|email|tech|cloud|coop|biz|berlin|hamburg|munich|cologne)";
const EMAIL_RE = new RegExp(
  String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.${ALLOWED_TLD}\b`,
  "g",
);

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

  // Block-level elements without inter-element whitespace cause Cheerio's
  // .text() to glue them together (e.g. <div>info@x.de</div><div>Tel: …</div>
  // becomes "info@x.deTel: …"). Inject a space at the start of every block
  // tag so .text() yields properly tokenised content.
  $("br").replaceWith(" ");
  $("p, div, span, li, td, th, h1, h2, h3, h4, h5, h6, address, dt, dd, section").each((_, el) => {
    $(el).prepend(" ");
  });
  // mailto links should keep a space *before* the address.
  $('a[href^="mailto:"], a[href^="tel:"]').each((_, el) => {
    $(el).prepend(" ").append(" ");
  });

  const text = collapseWhitespace($("body").text());

  const emails = extractEmails(text, $);
  const phones = extractPhones(text);

  const zipMatch = findZipCityMatch(text);
  const zipCode = zipMatch?.[1];
  const city = zipMatch?.[2]?.split(/\s+/)[0];

  const country = guessCountryFromText(text);
  const companyName = guessCompanyName(text, $);
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

/** Junky tokens that often appear glued to the company name in raw text. */
const NAME_BLACKLIST_PHRASES = [
  "copyright",
  "©",
  "privacy policy",
  "datenschutz",
  "impressum",
  "kontakt",
  "haftungsausschluss",
  "weee",
  "anbieter",
  "betreiber",
  "verantwortlich",
  "all rights reserved",
];

function guessCompanyName(text: string, $: cheerio.CheerioAPI): string | undefined {
  // 1. og:site_name / application-name: most reliable on professional sites.
  const og = $('meta[property="og:site_name"]').attr("content")?.trim();
  if (og && isPlausibleCompanyName(og)) return og;
  const app = $('meta[name="application-name"]').attr("content")?.trim();
  if (app && isPlausibleCompanyName(app)) return app;

  // 2. JSON-LD Organization @type — high precision when available.
  let jsonLdName: string | undefined;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLdName) return false;
    try {
      const data = JSON.parse($(el).contents().text());
      const candidates = Array.isArray(data) ? data : [data];
      for (const c of candidates) {
        const t = c?.["@type"];
        if (
          (t === "Organization" || t === "LocalBusiness" || (Array.isArray(t) && t.includes("Organization"))) &&
          typeof c.name === "string" &&
          isPlausibleCompanyName(c.name)
        ) {
          jsonLdName = c.name.trim();
          return false;
        }
      }
    } catch {
      /* ignore */
    }
    return undefined;
  });
  if (jsonLdName) return jsonLdName;

  // 3. Anchor pattern: "Anbieter:" / "Verantwortlich:" / "Firma:".
  const anchors = ["Anbieter:", "Betreiber:", "Verantwortlich:", "Verantwortlicher:", "Firma:", "Inhaber:"];
  for (const a of anchors) {
    const idx = text.indexOf(a);
    if (idx >= 0) {
      const tail = text.slice(idx + a.length, idx + a.length + 200);
      const m = tail.match(/([A-ZÄÖÜ][\w&.\-äöüßéèà ]{2,80}?(?:GmbH|AG|UG|GbR|KG|OHG|e\.K\.|e\.V\.|Co\. KG|GmbH & Co\. KG))/);
      if (m?.[1] && isPlausibleCompanyName(m[1])) return m[1].trim();
    }
  }

  // 4. Last fallback: first "Name + Rechtsform" occurrence in the body.
  const m2 = text.match(/([A-ZÄÖÜ][\wäöüß&.\-éèà ]{2,80}?)\s+(GmbH|AG|UG|GbR|KG|OHG|e\.K\.|e\.V\.|Co\. KG|GmbH & Co\. KG)\b/);
  if (m2?.[0] && isPlausibleCompanyName(m2[0])) return m2[0].trim();
  return undefined;
}

function isPlausibleCompanyName(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 3 || t.length > 80) return false;
  const lower = t.toLowerCase();
  for (const bad of NAME_BLACKLIST_PHRASES) {
    if (lower.startsWith(bad) || lower.includes(` ${bad} `)) return false;
  }
  // Reject if it looks like an article/page title.
  if (/[“”„"`'!?]/.test(t)) return false;
  if (/\d{2,}\s*[xX×]\s*\d{2,}/.test(t)) return false; // "128x64" → product spec
  if (/zoll|inch|pixel|modul|display/i.test(t) && !/gmbh|ag|kg|gbr|ug/i.test(t)) return false;
  return true;
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
