"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ProductsSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const next = new URLSearchParams();
        const value = String(data.get("q") ?? "").trim();
        if (value) next.set("q", value);
        router.push(`${pathname}?${next.toString()}`);
      }}
      className="flex flex-wrap gap-2"
    >
      <Input
        name="q"
        defaultValue={q}
        placeholder="Suche nach AZ-Code, Produktname oder Kategorie …"
        className="max-w-xl flex-1"
      />
      <Button type="submit" variant="secondary">Suchen</Button>
      {q ? (
        <Button type="button" variant="ghost" onClick={() => router.push(pathname)}>
          Zurücksetzen
        </Button>
      ) : null}
    </form>
  );
}
