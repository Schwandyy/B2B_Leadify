import Link from "next/link";
import { ImportWizard } from "@/components/products/import-wizard";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <Link href="/products" className="text-xs text-slate-500 hover:text-slate-900">
          ← Produkte
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Bulk-Import aus Mastertabelle</h1>
        <p className="text-sm text-slate-500">
          Lade eine Excel-/CSV-Datei oder verbinde ein Google-Sheet — wir mappen die Spalten automatisch
          und können auf Wunsch jede Produkt-URL aufrufen, um Beschreibung und Highlights zu ziehen.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
