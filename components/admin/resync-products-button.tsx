"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  resyncProductsFromMaster,
  type ResyncProductsResult,
} from "@/app/(app)/admin/inventory/actions";

export function ResyncProductsButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ResyncProductsResult | null>(null);

  const onClick = () => {
    if (
      !confirm(
        "Aus der Master-Sheet werden alle Produktnamen aktualisiert und fehlende AZ-Codes als neue Produkte angelegt. Fortfahren?",
      )
    ) {
      return;
    }
    setResult(null);
    start(async () => {
      const r = await resyncProductsFromMaster();
      setResult(r);
    });
  };

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" onClick={onClick} disabled={pending}>
        {pending ? "Synchronisiere…" : "Produkte aus Sheet aktualisieren"}
      </Button>
      {result ? (
        <div
          className={
            result.ok
              ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
              : "rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
          }
        >
          {result.ok ? (
            <p>
              Fertig — {result.updated} Produkte umbenannt, {result.created} neu angelegt,{" "}
              {result.unchanged} bereits korrekt.
            </p>
          ) : (
            <p>{result.error}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
