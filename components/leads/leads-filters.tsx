"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LeadsFilters({ products }: { products: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function update(key: string, value: string | undefined) {
    const next = new URLSearchParams(sp.toString());
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const next = new URLSearchParams();
        for (const [k, v] of data.entries()) {
          if (typeof v === "string" && v.length) next.set(k, v);
        }
        router.push(`${pathname}?${next.toString()}`);
      }}
      className="grid gap-3 sm:grid-cols-6"
    >
      <div className="sm:col-span-2">
        <Label htmlFor="q">Suche</Label>
        <Input id="q" name="q" defaultValue={sp.get("q") ?? ""} placeholder="Firma, Branche, Stadt" />
      </div>
      <div>
        <Label htmlFor="productId">Produkt</Label>
        <Select id="productId" name="productId" defaultValue={sp.get("productId") ?? ""}>
          <option value="">Alle Produkte</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={sp.get("status") ?? ""}>
          <option value="">Alle</option>
          {[
            "NEW",
            "REVIEWED",
            "RELEVANT",
            "CONTACTED",
            "REPLIED",
            "MEETING_BOOKED",
            "OFFER_SENT",
            "WON",
            "LOST",
            "ARCHIVED",
          ].map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="minScore">Score min.</Label>
        <Input id="minScore" name="minScore" type="number" min={0} max={100} defaultValue={sp.get("minScore") ?? ""} />
      </div>
      <div>
        <Label htmlFor="hasContact">Kontakt</Label>
        <Select id="hasContact" name="hasContact" defaultValue={sp.get("hasContact") ?? ""}>
          <option value="">Egal</option>
          <option value="yes">vorhanden</option>
          <option value="no">fehlt</option>
        </Select>
      </div>
      <div className="sm:col-span-6 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.push(pathname)}>
          Zurücksetzen
        </Button>
        <Button type="submit" variant="secondary">Filtern</Button>
      </div>
    </form>
  );
}
