"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const STOCK_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Alle Bestände" },
  { value: "in_stock", label: "Auf Lager (>0)" },
  { value: "low", label: "Niedriger Bestand (1–10)" },
  { value: "out", label: "Ausverkauft (0)" },
  { value: "none", label: "Ohne Bestandsdaten" },
];

export function ProductsSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const stock = sp.get("stock") ?? "all";
  const view = sp.get("view") ?? "";

  const buildUrl = (overrides: Record<string, string>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string> = { q, stock, view, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue;
      if (k === "stock" && v === "all") continue;
      next.set(k, v);
    }
    const qs = next.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    router.push(
      buildUrl({
        q: String(data.get("q") ?? "").trim(),
        stock: String(data.get("stock") ?? "all"),
      }),
    );
  };

  const onStockChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    router.push(buildUrl({ stock: e.target.value }));
  };

  const isFiltered = Boolean(q) || (stock !== "all");

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
      <Input
        name="q"
        defaultValue={q}
        placeholder="Suche nach AZ-Code, Produktname oder Kategorie …"
        className="min-w-64 max-w-xl flex-1"
      />
      <Select
        name="stock"
        defaultValue={stock}
        onChange={onStockChange}
        className="w-auto"
      >
        {STOCK_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary">Suchen</Button>
      {isFiltered ? (
        <Button type="button" variant="ghost" onClick={() => router.push(pathname)}>
          Zurücksetzen
        </Button>
      ) : null}
    </form>
  );
}
