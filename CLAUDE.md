@AGENTS.md

# Product2Lead AI

Siehe `README.md` und `DEVELOPMENT_NOTES.md` für Stack, Setup und Architekturentscheidungen.

Schnellreferenz:
- Next.js 16 (App Router) — `proxy.ts` statt `middleware.ts`, `params`/`searchParams` sind Promises, `cookies()` ist async.
- AI-Provider und Research-Provider sind über Adapter austauschbar (`lib/ai/client.ts`, `lib/research/companyDiscovery.ts`).
- Default-Provider ist `mock` — kein externer API-Key nötig zum Entwickeln.
- Outreach-Mails werden bewusst nur als `DRAFT` erzeugt; kein automatischer Versand.
