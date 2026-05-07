/**
 * Minimal RFC4180-compatible CSV serializer. UTF-8 BOM so Excel
 * interprets umlauts correctly when opened directly.
 */
export function toCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  if (rows.length === 0 && !headers) return "﻿";
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s: string;
    if (Array.isArray(v)) s = v.join("; ");
    else if (typeof v === "object") s = JSON.stringify(v);
    else s = String(v);
    if (/[",\n;]/.test(s)) {
      s = `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [cols.join(";")];
  for (const row of rows) {
    lines.push(cols.map((c) => escape(row[c])).join(";"));
  }
  return "﻿" + lines.join("\n");
}
