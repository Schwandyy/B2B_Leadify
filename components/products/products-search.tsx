"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const RESET_KEEP = new Set(["view"]);

export function ProductsSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const next = new URLSearchParams(sp.toString());
    const value = String(data.get("q") ?? "").trim();
    if (value) next.set("q", value);
    else next.delete("q");
    next.delete("page");
    const qs = next.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const onReset = () => {
    const next = new URLSearchParams();
    for (const [k, v] of sp.entries()) {
      if (RESET_KEEP.has(k)) next.set(k, v);
    }
    const qs = next.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  // Aktiv: irgendein Filter-Param außer "view" gesetzt.
  const isFiltered = Array.from(sp.keys()).some((k) => !RESET_KEEP.has(k));

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
      <Input
        name="q"
        defaultValue={q}
        placeholder="Suche nach AZ-Code, Produktname oder Kategorie …"
        className="min-w-64 max-w-xl flex-1"
      />
      <Button type="submit" variant="secondary">Suchen</Button>
      {isFiltered ? (
        <Button type="button" variant="ghost" onClick={onReset}>
          Zurücksetzen
        </Button>
      ) : null}
    </form>
  );
}
