import { getResearchProvider } from "@/lib/research/companyDiscovery";

/**
 * Permanent reminder of which research provider is active. Loud red banner
 * for "mock" so demo data is never confused with real recherche; subtle
 * green stripe when the live crawler is on.
 */
export function ResearchModeBanner() {
  const provider = getResearchProvider();
  if (provider === "crawler") {
    return (
      <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs text-emerald-800">
        <span className="font-semibold">Live-Recherche aktiv</span> — Crawler durchsucht das Web (DuckDuckGo + eigener
        Impressum-Parser, robots.txt-konform).
      </div>
    );
  }
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[11px] font-bold text-amber-900">
          !
        </span>
        <span className="font-semibold">Demo-Modus:</span>
        <span>
          Suchläufe liefern <strong>fiktive</strong> Mock-Firmen (Domains auf <code>-example.de</code>). Für echte
          Recherche <code>RESEARCH_PROVIDER=crawler</code> in der <code>.env</code> setzen.
        </span>
      </div>
    </div>
  );
}
