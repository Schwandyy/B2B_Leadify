"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { consolidateByMasterSku, purgeMasterSkulessProducts } from "@/lib/products/consolidate";
import { Button } from "@/components/ui/button";

export function ConsolidateProductsButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function runConsolidate() {
    setStatus(null);
    start(async () => {
      const r = await consolidateByMasterSku();
      setStatus(
        r.removedDuplicates === 0
          ? "Keine Duplikate mit gleicher Master-SKU gefunden."
          : `${r.removedDuplicates} Duplikate konsolidiert · ${r.variantsAttached} Varianten angehängt.`,
      );
      router.refresh();
    });
  }

  function runPurge() {
    if (!confirm("Wirklich alle Produkte ohne Master-SKU und ohne Leads löschen?")) return;
    setStatus(null);
    start(async () => {
      const r = await purgeMasterSkulessProducts();
      setStatus(
        `${r.deleted} Produkte gelöscht. ${r.keptWithLeads} blieben (haben bereits Leads).`,
      );
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        Konsolidieren …
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" disabled={pending} onClick={runConsolidate}>
        Master-SKU-Duplikate zusammenfassen
      </Button>
      <Button variant="danger" size="sm" disabled={pending} onClick={runPurge}>
        Master-SKU-lose ohne Leads löschen
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setStatus(null); }}>
        Schließen
      </Button>
      {status ? <span className="text-xs text-slate-600">{status}</span> : null}
    </div>
  );
}
