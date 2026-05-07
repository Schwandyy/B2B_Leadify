"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzeProductAction, startSearchAction } from "@/lib/products/actions";
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
