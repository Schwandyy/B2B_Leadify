"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FieldHint } from "@/components/ui/input";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Mapping = Partial<Record<
  | "name"
  | "description"
  | "productUrl"
  | "category"
  | "targetRegion"
  | "targetCustomerTypes"
  | "keywords"
  | "exclusions"
  | "priceRangeMin"
  | "priceRangeMax",
  string
>>;

type Preview = {
  headers: string[];
  rowCount: number;
  sample: Record<string, string>[];
  mapping: Mapping;
  source: "excel" | "csv" | "google-sheets";
  sheetName?: string;
  warnings: string[];
};

type ImportItemResult = {
  rowIndex: number;
  productId?: string;
  name?: string;
  enrichment?: { ok: boolean; error?: string; status?: number };
  error?: string;
};

type ImportRunResult = {
  created: number;
  skipped: number;
  failed: number;
  items: ImportItemResult[];
};

const FIELD_LABELS: Array<[keyof Mapping, string, string?]> = [
  ["name", "Produktname", "Pflicht"],
  ["description", "Beschreibung"],
  ["productUrl", "Produkt-URL"],
  ["category", "Kategorie"],
  ["targetRegion", "Region"],
  ["targetCustomerTypes", "Zielkunden"],
  ["keywords", "Keywords"],
  ["exclusions", "Ausschlüsse"],
  ["priceRangeMin", "Preis min"],
  ["priceRangeMax", "Preis max"],
];

export function ImportWizard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [enrichLinks, setEnrichLinks] = useState(true);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportRunResult | null>(null);

  async function doPreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setPreviewing(true);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (sheetUrl) fd.append("sheetUrl", sheetUrl);
      const res = await fetch("/api/import/preview", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Preview fehlgeschlagen.");
      setPreview(json as Preview);
      setMapping(json.mapping ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview fehlgeschlagen.");
    } finally {
      setPreviewing(false);
    }
  }

  async function doImport() {
    if (!preview) return;
    if (!mapping.name) {
      setError("Bitte zuerst die Spalte für 'Produktname' zuordnen.");
      return;
    }
    setError(null);
    setImporting(true);
    setResult(null);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (sheetUrl) fd.append("sheetUrl", sheetUrl);
      fd.append("mapping", JSON.stringify(mapping));
      fd.append("enrichLinks", String(enrichLinks));
      fd.append("autoAnalyze", String(autoAnalyze));
      const res = await fetch("/api/import/execute", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import fehlgeschlagen.");
      setResult(json as ImportRunResult);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setFile(null);
    setSheetUrl("");
    setPreview(null);
    setMapping({});
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Quelle wählen</CardTitle>
          <CardSubtitle>Excel-/CSV-Datei hochladen oder Google-Sheets-Link einfügen.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={doPreview} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="file">Excel oder CSV</Label>
                <input
                  id="file"
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setSheetUrl("");
                    setPreview(null);
                    setResult(null);
                  }}
                  className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
                />
                <FieldHint>Header-Zeile in Zeile 1. Datums- und Zahlfelder werden in Text gewandelt.</FieldHint>
              </div>
              <div>
                <Label htmlFor="sheetUrl">Google-Sheets-URL</Label>
                <Input
                  id="sheetUrl"
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={sheetUrl}
                  onChange={(e) => {
                    setSheetUrl(e.target.value);
                    setFile(null);
                    setPreview(null);
                    setResult(null);
                  }}
                  disabled={!!file}
                />
                <FieldHint>Freigabe muss &laquo;Jeder mit dem Link&raquo; sein.</FieldHint>
              </div>
            </div>
            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              {preview ? (
                <Button type="button" variant="ghost" onClick={reset}>
                  Zurücksetzen
                </Button>
              ) : null}
              <Button type="submit" disabled={previewing || (!file && !sheetUrl)}>
                {previewing ? "Lese Tabelle …" : preview ? "Vorschau aktualisieren" : "Vorschau anzeigen"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>Spalten zuordnen</CardTitle>
            <CardSubtitle>
              {preview.rowCount} Datensätze · {preview.headers.length} Spalten · Quelle: {preview.source}
              {preview.sheetName ? ` · Sheet: ${preview.sheetName}` : ""}
            </CardSubtitle>
          </CardHeader>
          <CardBody className="space-y-5">
            {preview.warnings.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {preview.warnings.map((w) => <div key={w}>{w}</div>)}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELD_LABELS.map(([field, label, hint]) => (
                <div key={field}>
                  <Label htmlFor={`m_${field}`}>
                    {label} {hint ? <span className="text-slate-400">({hint})</span> : null}
                  </Label>
                  <Select
                    id={`m_${field}`}
                    value={mapping[field] ?? ""}
                    onChange={(e) =>
                      setMapping((prev) => ({ ...prev, [field]: e.target.value || undefined }))
                    }
                  >
                    <option value="">— nicht zuordnen —</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Vorschau (erste 8 Zeilen)</h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      {preview.headers.map((h) => (
                        <th key={h} className="px-2 py-2 font-medium text-slate-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {preview.headers.map((h) => (
                          <td key={h} className="max-w-[200px] truncate px-2 py-1.5 text-slate-700">{row[h] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <input
                  type="checkbox"
                  checked={enrichLinks}
                  onChange={(e) => setEnrichLinks(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  <span className="block text-sm font-medium">Produkt-URLs öffnen und Inhalte ziehen</span>
                  <span className="block text-xs text-slate-500">
                    Liest Title, Meta-Description, H1 und Hauptinhalt jeder Produktseite und hängt diese an die Beschreibung an. Timeout 8 s, max 1 MB pro Seite.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <input
                  type="checkbox"
                  checked={autoAnalyze}
                  onChange={(e) => setAutoAnalyze(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  <span className="block text-sm font-medium">KI-Analyse direkt nach Import starten</span>
                  <span className="block text-xs text-slate-500">
                    Erzeugt für jedes Produkt eine Zielbranchen- und Käuferrollen-Analyse. Im Mock-Modus sofort, mit echtem Provider zeit- und kostenintensiv.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" disabled={importing || !mapping.name} onClick={doImport}>
                {importing ? "Importiere …" : `Import starten (${preview.rowCount})`}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Import-Ergebnis</CardTitle>
            <CardSubtitle>
              {result.created} angelegt · {result.skipped} übersprungen · {result.failed} fehlerhaft
            </CardSubtitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Produkt</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Anreicherung</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it) => (
                    <tr key={it.rowIndex} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 tabular-nums text-slate-500">{it.rowIndex + 1}</td>
                      <td className="px-2 py-1.5">
                        {it.productId ? (
                          <Link href={`/products/${it.productId}`} className="font-medium underline">
                            {it.name}
                          </Link>
                        ) : (
                          <span className="text-slate-700">{it.name ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {it.error ? (
                          <Badge variant="danger">{it.error}</Badge>
                        ) : it.productId ? (
                          <Badge variant="success">angelegt</Badge>
                        ) : (
                          <Badge variant="muted">übersprungen</Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {it.enrichment ? (
                          it.enrichment.ok ? (
                            <Badge variant="info">Seite gelesen</Badge>
                          ) : (
                            <Badge variant="warning">{it.enrichment.error ?? "fehlgeschlagen"}</Badge>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Link href="/products">
                <Button variant="secondary">Zur Produktliste</Button>
              </Link>
              <Button onClick={reset}>Weiteren Import starten</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
