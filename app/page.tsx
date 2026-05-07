import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const session = await readSession();
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              P2
            </span>
            <span className="text-sm font-semibold tracking-tight">Product2Lead AI</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Login</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Account anlegen</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
          B2B Lead Intelligence — von Produkt zu qualifiziertem Lead
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Aus jedem Produkt die richtigen Käufer finden.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Lade ein Produkt hoch — Beschreibung, Datenblatt oder Link. Product2Lead AI analysiert
          den Nutzen, identifiziert relevante Branchen, findet öffentlich auffindbare B2B-Kontakte
          und schlägt personalisierte Akquise-Wege vor. DSGVO-orientiert, CRM-fähig, exportierbar.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/register">
            <Button>Jetzt kostenlos starten</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary">Zum Login</Button>
          </Link>
        </div>

        <dl className="mt-16 grid gap-6 sm:grid-cols-3">
          {[
            ["Produktanalyse", "KI extrahiert Nutzen, Branchen und Käuferrollen."],
            ["Lead-Recherche", "Modulare Engine, austauschbare Datenquellen, Dedup & Scoring."],
            ["Personalisierte Outreach", "E-Mail, LinkedIn, Telefon-Leitfaden — manuell freizugeben."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <dt className="text-sm font-semibold text-slate-900">{title}</dt>
              <dd className="mt-1 text-sm text-slate-600">{body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
