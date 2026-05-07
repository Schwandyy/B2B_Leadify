"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint, Textarea } from "@/components/ui/input";
import {
  connectAndSync,
  runInventorySync,
  deleteInventorySource,
  type ConnectAndSyncResult,
  type SyncActionResult,
} from "@/app/(app)/admin/inventory/actions";

type Props = {
  initial: {
    sheetUrl: string;
    description: string;
    skuColumn: string;
    stockColumn: string;
  } | null;
};

export function InventoryForm({ initial }: Props) {
  const [connecting, startConnect] = useTransition();
  const [resyncing, startResync] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [connectResult, setConnectResult] = useState<ConnectAndSyncResult | null>(null);
  const [resyncResult, setResyncResult] = useState<SyncActionResult | null>(null);

  const onConnect = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setConnectResult(null);
    setResyncResult(null);
    const data = new FormData(e.currentTarget);

    startConnect(async () => {
      const result = await connectAndSync({
        sheetUrl: String(data.get("sheetUrl") ?? ""),
        description: String(data.get("description") ?? ""),
      });
      setConnectResult(result);
    });
  };

  const onResync = () => {
    setConnectResult(null);
    setResyncResult(null);
    startResync(async () => {
      const result = await runInventorySync();
      setResyncResult(result);
    });
  };

  const onDelete = () => {
    if (!confirm("Inventory-Quelle und alle Bestände löschen?")) return;
    startDelete(async () => {
      await deleteInventorySource();
      setConnectResult(null);
      setResyncResult(null);
    });
  };

  const buttonLabel = initial ? "Neu verbinden & synchronisieren" : "Verbinden & synchronisieren";

  return (
    <div className="space-y-6">
      <form onSubmit={onConnect} className="space-y-4">
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
          <FieldHint>
            Sheet muss „Jeder mit dem Link – Betrachter&ldquo; freigegeben sein. Vor dem Kopieren
            in Google Sheets auf den richtigen Tab klicken — die URL enthält dann automatisch die Tab-Kennung.
          </FieldHint>
        </div>

        <div>
          <Label htmlFor="description">Beschreibung der Sheet</Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            placeholder="z. B. „Lagerbestand-Master. AZ-Codes wie AZ001 stehen in einer Spalte, der verfügbare Bestand als Zahl in einer anderen."
            defaultValue={initial?.description ?? ""}
          />
          <FieldHint>
            Optional, hilft der KI beim automatischen Erkennen der richtigen Spalten.
          </FieldHint>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={connecting || resyncing || deleting}>
            {connecting ? "Verbinde…" : buttonLabel}
          </Button>
          {initial ? (
            <>
              <Button type="button" variant="secondary" onClick={onResync} disabled={connecting || resyncing || deleting}>
                {resyncing ? "Synchronisiere…" : "Nur erneut synchronisieren"}
              </Button>
              <Button type="button" variant="ghost" onClick={onDelete} disabled={connecting || resyncing || deleting}>
                {deleting ? "Lösche…" : "Quelle entfernen"}
              </Button>
            </>
          ) : null}
        </div>
      </form>

      {connectResult ? <ConnectResultPanel result={connectResult} /> : null}
      {resyncResult ? <ResyncResultPanel result={resyncResult} /> : null}

      {initial ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <div className="font-medium text-slate-900">Aktuelle Verbindung</div>
          <div className="mt-1">
            AZ-Code-Spalte: <code className="font-mono">{initial.skuColumn}</code> · Bestand-Spalte:{" "}
            <code className="font-mono">{initial.stockColumn}</code>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConnectResultPanel({ result }: { result: ConnectAndSyncResult }) {
  if (result.ok) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-medium">
          Verbunden{result.tab ? ` mit Tab „${result.tab}"` : ""} und synchronisiert —{" "}
          {result.rowsRead} Zeile(n) gelesen, {result.rowsWritten} Bestände gespeichert.
        </p>
        <p className="mt-1 text-xs">
          Erkannt: AZ-Code in <code className="font-mono">{result.mapping.skuColumn}</code>, Bestand
          in <code className="font-mono">{result.mapping.stockColumn}</code>.
        </p>
        {result.mapping.reasoning ? (
          <p className="mt-1 text-xs text-emerald-800/80">{result.mapping.reasoning}</p>
        ) : null}
        {result.warnings.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p className="font-medium">{result.error}</p>
      {result.tab ? (
        <p className="mt-1 text-xs">
          Geladener Tab: <code className="font-mono">{result.tab}</code>
        </p>
      ) : null}
      {result.hint ? <p className="mt-2 text-xs">{result.hint}</p> : null}
      {result.headers && result.headers.length > 0 ? (
        <p className="mt-2 text-xs">
          Spalten in der geladenen Tab:{" "}
          <span className="font-mono text-[11px]">{result.headers.join(", ")}</span>
        </p>
      ) : null}
    </div>
  );
}

function ResyncResultPanel({ result }: { result: SyncActionResult }) {
  if (result.ok) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        Sync ausgeführt — {result.rowsRead} Zeile(n) gelesen, {result.rowsWritten} Bestände
        aktualisiert.
        {result.warnings.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      Sync fehlgeschlagen: {result.error}
    </div>
  );
}
