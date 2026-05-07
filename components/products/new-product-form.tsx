"use client";

import { useActionState } from "react";
import { createProductAction, type ProductActionResult } from "@/lib/products/actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Label, FieldHint } from "@/components/ui/input";

const TARGET_OPTIONS: Array<[string, string]> = [
  ["RESELLER", "Wiederverkäufer"],
  ["MANUFACTURER", "Hersteller"],
  ["ENTERPRISE", "Großkunden"],
  ["DISTRIBUTOR", "Distributoren"],
  ["RETAILER", "Händler"],
  ["EDUCATION", "Schulen / Bildung"],
  ["PUBLIC_SECTOR", "Behörden / Öffentliche Hand"],
  ["SERVICE_PROVIDER", "Dienstleister"],
  ["AGENCY", "Agenturen"],
  ["PARTNER", "Kooperationspartner"],
];

const REGIONS: Array<[string, string]> = [
  ["DE", "Deutschland"],
  ["DACH", "DACH"],
  ["EU", "EU"],
  ["WORLD", "Weltweit"],
];

export function NewProductForm() {
  const [state, formAction, pending] = useActionState<ProductActionResult | null, FormData>(
    createProductAction,
    null,
  );

  return (
    <form action={formAction} className="grid gap-6" encType="multipart/form-data">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Produktname</Label>
          <Input id="name" name="name" required maxLength={180} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="description">Produktbeschreibung</Label>
          <Textarea id="description" name="description" required minLength={10} rows={5} />
          <FieldHint>Je detaillierter, desto besser die Analyse.</FieldHint>
        </div>
        <div>
          <Label htmlFor="productUrl">Produktlink (optional)</Label>
          <Input id="productUrl" name="productUrl" type="url" placeholder="https://…" />
        </div>
        <div>
          <Label htmlFor="category">Kategorie (optional)</Label>
          <Input id="category" name="category" maxLength={80} />
        </div>
        <div>
          <Label htmlFor="targetRegion">Zielregion</Label>
          <Select id="targetRegion" name="targetRegion" defaultValue="DE">
            {REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="priceRangeMin">Preis von</Label>
            <Input id="priceRangeMin" name="priceRangeMin" type="number" min={0} />
          </div>
          <div>
            <Label htmlFor="priceRangeMax">Preis bis</Label>
            <Input id="priceRangeMax" name="priceRangeMax" type="number" min={0} />
          </div>
        </div>
      </section>

      <section>
        <Label>Zielkundentypen</Label>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3">
          {TARGET_OPTIONS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="targetCustomerTypes" value={value} className="h-4 w-4 rounded border-slate-300" />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="keywords">Keywords</Label>
          <Textarea id="keywords" name="keywords" rows={3} placeholder="komma- oder zeilengetrennt" />
          <FieldHint>Hilft der Recherche, Treffer zu priorisieren.</FieldHint>
        </div>
        <div>
          <Label htmlFor="exclusions">Ausschlusskriterien</Label>
          <Textarea id="exclusions" name="exclusions" rows={3} placeholder="z. B. Branchen, Wettbewerber, Regionen" />
        </div>
      </section>

      <section>
        <Label htmlFor="attachment">Anhang (PDF, Datenblatt, Bild — optional)</Label>
        <input
          id="attachment"
          name="attachment"
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,text/plain"
          className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
        />
        <FieldHint>Max. 6 MB.</FieldHint>
      </section>

      <input type="hidden" name="currency" value="EUR" />

      {state && !state.ok ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Wird angelegt …" : "Produkt anlegen"}
        </Button>
      </div>
    </form>
  );
}
