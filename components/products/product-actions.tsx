"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  analyzeProductAction,
  startSearchAction,
  enrichProductAction,
  type EnrichResult,
} from "@/lib/products/actions";
import { Button } from "@/components/ui/button";

export function AnalyzeButton({ productId, hasAnalysis }: { productId: string; hasAnalysis: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant={hasAnalysis ? "secondary" : "primary"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await analyzeProductAction(productId);
          router.refresh();
        })
      }
    >
      {pending ? "Analysiere …" : hasAnalysis ? "Analyse aktualisieren" : "KI-Analyse starten"}
    </Button>
  );
}

export function StartSearchButton({ productId, disabled }: { productId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          await startSearchAction(productId);
          router.refresh();
        })
      }
    >
      {pending ? "Suchlauf läuft …" : "Suchlauf starten"}
    </Button>
  );
}

export function EnrichButton({ productId }: { productId: string }) {
  const [pending, start] = useTransition();
  const [last, setLast] = useState<EnrichResult | null>(null);
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await enrichProductAction(productId);
            setLast(r);
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? "Lade Beschreibung …" : "Beschreibung neu laden"}
      </Button>
      {last ? (
        last.ok ? (
          <span className="text-xs text-emerald-700">
            ✓ aus {last.source} ({last.bytes} Zeichen) — KI-Analyse zurückgesetzt
          </span>
        ) : (
          <span className="text-xs text-rose-700">{last.error}</span>
        )
      ) : null}
    </div>
  );
}
