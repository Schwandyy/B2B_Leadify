"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint, Textarea } from "@/components/ui/input";
import {
  saveInventorySource,
  runInventorySync,
  deleteInventorySource,
  analyzeMapping,
  type SyncActionResult,
  type AnalyzeMappingResult,
} from "@/app/(app)/admin/inventory/actions";

type Props = {
  initial: {
    sheetUrl: string;
    gid: string;
    headerRow: string;
    description: string;
    skuColumn: string;
    stockColumn: string;
  } | null;
};

export function InventoryForm({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const [syncing, startSync] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [analyzing, startAnalyze] = useTransition();
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncActionResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeMappingResult | null>(null);

  // Refs auf die Spalten-Felder, damit ein KI-Vorschlag sie befüllen kann.
  const skuRef = useRef<HTMLInputElement>(null);
  const stockRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const onSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveMsg(null);
    const data = new FormData(e.currentTarget);
    const headerRowRaw = String(data.get("headerRow") ?? "").trim();
    const headerRowParsed = headerRowRaw ? parseInt(headerRowRaw, 10) : NaN;

    startTransition(async () => {
      const result = await saveInventorySource({
        sheetUrl: String(data.get("sheetUrl") ?? ""),
        gid: String(data.get("gid") ?? ""),
        headerRow: Number.isFinite(headerRowParsed) && headerRowParsed > 0 ? headerRowParsed : undefined,
        description: String(data.get("description") ?? ""),
        skuColumn: String(data.get("skuColumn") ?? ""),
        stockColumn: String(data.get("stockColumn") ?? ""),
      });
      if (result.ok) setSaveMsg({ kind: "ok", text: "Gespeichert." });
      else setSaveMsg({ kind: "err", text: result.error });
    });
  };

  const onAnalyze = () => {
    setAnalysis(null);
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const headerRowRaw = String(data.get("headerRow") ?? "").trim();
    const headerRowParsed = headerRowRaw ? parseInt(headerRowRaw, 10) : NaN;

    startAnalyze(async () => {
      const result = await analyzeMapping({
        sheetUrl: String(data.get("sheetUrl") ?? ""),
        gid: String(data.get("gid") ?? ""),
        headerRow: Number.isFinite(headerRowParsed) && headerRowParsed > 0 ? headerRowParsed : undefined,
        description: String(data.get("description") ?? ""),
      });
      setAnalysis(result);

      if (result.ok) {
        // Vorschläge nur übernehmen, wenn die Felder leer sind oder explizit
        // bestätigt — wir patchen sie direkt, der User kann dann override.
        if (result.suggestion.skuColumn && skuRef.current && !skuRef.current.value) {
          skuRef.current.value = result.suggestion.skuColumn;
        }
        if (result.suggestion.stockColumn && stockRef.current && !stockRef.current.value) {
          stockRef.current.value = result.suggestion.stockColumn;
        }
      }
    });
  };

  const onApplySuggestion = () => {
    if (!analysis || !analysis.ok) return;
    if (analysis.suggestion.skuColumn && skuRef.current) {
      skuRef.current.value = analysis.suggestion.skuColumn;
    }
    if (analysis.suggestion.stockColumn && stockRef.current) {
      stockRef.current.value = analysis.suggestion.stockColumn;
    }
  };

  const onSync = () => {
    setSyncResult(null);
    startSync(async () => {
      const result = await runInventorySync();
      setSyncResult(result);
    });
  };

  const onDelete = () => {
    if (!confirm("Inventory-Quelle und alle Bestände löschen?")) return;
    startDelete(async () => {
      await deleteInventorySource();
      setSyncResult(null);
      setSaveMsg(null);
      setAnalysis(null);
    });
  };

  return (
    <div className="space-y-6">
      <form ref={formRef} onSubmit={onSave} className="space-y-4">
        <div>
          <Label htmlFor="sheetUrl">Google-Sheets-URL</Label>
          <Input
            id="sheetUrl"
            name="sheetUrl"
            type="url"
            required
            placeholder="https://docs.google.com/spreadsheets/d/…"
            defaultValue={initial?.sheetUrl ?? ""}
          />
          <FieldHint>Sheet muss „Jeder mit dem Link – Betrachter&ldquo; freigegeben sein.</FieldHint>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="gid">Tab-ID (gid)</Label>
            <Input
              id="gid"
              name="gid"
              placeholder="leer = aus URL übernehmen"
              defaultValue={initial?.gid ?? ""}
            />
            <FieldHint>Optional. Aus der URL nach <code>#gid=</code>.</FieldHint>
          </div>
          <div>
            <Label htmlFor="headerRow">Header-Zeile</Label>
            <Input
              id="headerRow"
              name="headerRow"
              type="number"
              min={1}
              placeholder="leer = automatisch"
              defaultValue={initial?.headerRow ?? ""}
            />
            <FieldHint>Optional. 1-basiert, z. B. 2 wenn Zeile 1 ein Titel ist.</FieldHint>
          </div>
        </div>

        <div>
          <Label htmlFor="description">Beschreibung der Sheet</Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            placeholder="z. B. „Wöchentlicher Lagerbestand-Export. Spalte AZ-Code enthält Master-SKUs wie AZ001, Spalte 'Verfügbar' den freien Bestand in Stück."
            defaultValue={initial?.description ?? ""}
          />
          <FieldHint>
            Optional. Wird vom KI-Auto-Mapping als Hint genutzt, um die Spalten unten
            automatisch zu erkennen.
          </FieldHint>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={onAnalyze} disabled={analyzing}>
            {analyzing ? "Analysiere…" : "Spalten automatisch erkennen"}
          </Button>
          <span className="text-xs text-slate-500">
            Lädt die Sheet, schickt Header + Beschreibung an die KI und schlägt
            passende Spalten vor.
          </span>
        </div>

        {analysis ? <AnalysisPanel result={analysis} onApply={onApplySuggestion} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="skuColumn">Spalte: AZ-Code</Label>
            <Input
              ref={skuRef}
              id="skuColumn"
              name="skuColumn"
              required
              placeholder="z. B. AZ-Code"
              defaultValue={initial?.skuColumn ?? ""}
            />
            <FieldHint>Exakter Header-Name aus der Sheet.</FieldHint>
          </div>
          <div>
            <Label htmlFor="stockColumn">Spalte: Bestand</Label>
            <Input
              ref={stockRef}
              id="stockColumn"
              name="stockColumn"
              required
              placeholder="z. B. Verfügbar"
              defaultValue={initial?.stockColumn ?? ""}
            />
            <FieldHint>Spalte mit verfügbarer Stückzahl pro AZ-Code.</FieldHint>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Speichere…" : "Speichern"}
          </Button>
          {initial ? (
            <>
              <Button type="button" variant="secondary" onClick={onSync} disabled={syncing}>
                {syncing ? "Synchronisiere…" : "Jetzt synchronisieren"}
              </Button>
              <Button type="button" variant="ghost" onClick={onDelete} disabled={deleting}>
                {deleting ? "Lösche…" : "Quelle entfernen"}
              </Button>
            </>
          ) : null}
          {saveMsg ? (
            <span
              className={
                saveMsg.kind === "ok"
                  ? "text-sm text-emerald-600"
                  : "text-sm text-rose-600"
              }
            >
              {saveMsg.text}
            </span>
          ) : null}
        </div>
      </form>

      {syncResult ? (
        <div
          className={
            syncResult.ok
              ? "rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
              : "rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          }
        >
          {syncResult.ok ? (
            <p>
              Sync erfolgreich — {syncResult.rowsRead} Zeile(n) gelesen,{" "}
              {syncResult.rowsWritten} Bestände geschrieben.
            </p>
          ) : (
            <p>Sync fehlgeschlagen: {syncResult.error}</p>
          )}
          {syncResult.warnings && syncResult.warnings.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {syncResult.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AnalysisPanel({
  result,
  onApply,
}: {
  result: AnalyzeMappingResult;
  onApply: () => void;
}) {
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        Analyse fehlgeschlagen: {result.error}
      </div>
    );
  }

  const { suggestion, headers, sheetWarnings } = result;
  const confidenceLabel = {
    high: { text: "hoch", classes: "bg-emerald-100 text-emerald-800" },
    medium: { text: "mittel", classes: "bg-amber-100 text-amber-800" },
    low: { text: "niedrig", classes: "bg-rose-100 text-rose-800" },
  }[suggestion.confidence];
  const sourceLabel = suggestion.source === "ai" ? `KI (${suggestion.model ?? "?"})` : "Heuristik";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-slate-900">Vorschlag</strong>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceLabel.classes}`}>
          Konfidenz: {confidenceLabel.text}
        </span>
        <span className="text-xs text-slate-500">Quelle: {sourceLabel}</span>
      </div>
      <ul className="mt-3 space-y-1 text-slate-700">
        <li>
          <strong>AZ-Code:</strong>{" "}
          {suggestion.skuColumn ? (
            <code className="font-mono text-xs">{suggestion.skuColumn}</code>
          ) : (
            <span className="text-rose-600">nicht erkannt</span>
          )}
        </li>
        <li>
          <strong>Bestand:</strong>{" "}
          {suggestion.stockColumn ? (
            <code className="font-mono text-xs">{suggestion.stockColumn}</code>
          ) : (
            <span className="text-rose-600">nicht erkannt</span>
          )}
        </li>
      </ul>
      {suggestion.reasoning ? (
        <p className="mt-2 text-xs text-slate-600">{suggestion.reasoning}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={onApply}>
          Vorschlag übernehmen
        </Button>
        <span className="text-xs text-slate-500">
          {headers.length} Spalten in Sheet: {headers.slice(0, 8).join(", ")}
          {headers.length > 8 ? ` … (+${headers.length - 8})` : ""}
        </span>
      </div>
      {(suggestion.warnings.length > 0 || sheetWarnings.length > 0) ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
          {suggestion.warnings.map((w, i) => (
            <li key={`s-${i}`}>{w}</li>
          ))}
          {sheetWarnings.map((w, i) => (
            <li key={`sh-${i}`}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
