"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import {
  saveInventorySource,
  runInventorySync,
  deleteInventorySource,
  type SyncActionResult,
} from "@/app/(app)/admin/inventory/actions";

type Props = {
  initial: {
    sheetUrl: string;
    gid: string;
    headerRow: string;
    skuColumn: string;
    stockColumn: string;
  } | null;
};

export function InventoryForm({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const [syncing, startSync] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncActionResult | null>(null);

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
        skuColumn: String(data.get("skuColumn") ?? ""),
        stockColumn: String(data.get("stockColumn") ?? ""),
      });
      if (result.ok) setSaveMsg({ kind: "ok", text: "Gespeichert." });
      else setSaveMsg({ kind: "err", text: result.error });
    });
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
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSave} className="space-y-4">
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
          <FieldHint>Sheet muss „Jeder mit dem Link – Betrachter" freigegeben sein.</FieldHint>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="skuColumn">Spalte: AZ-Code</Label>
            <Input
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
