# Product2Lead AI

B2B Lead Intelligence — aus einem Produkt automatisch passende Geschäftskunden, Distributoren, Schulen, Behörden oder Kooperationspartner finden, qualifizieren und personalisiert ansprechen.

> Status: **MVP-Grundgerüst** (Mai 2026). Echte Such-/Crawling-Provider sind als austauschbare Module vorgesehen. Standardmäßig läuft alles gegen Mock-Provider, sodass keine externen API-Keys nötig sind.

## Stack

- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, React 19
- **Backend:** Next.js Server Actions + Route Handlers
- **DB / ORM:** PostgreSQL + Prisma
- **Auth:** Eigene Lösung (signed JWT cookie via `jose`, bcrypt für Passwörter, Multi-Tenant via `Organization`)
- **AI:** Adapter-Pattern für `mock` (default), `openai` und `anthropic`
- **Research:** Adapter-Pattern. `mock` (Default — fiktive Demo-Firmen) oder `crawler` (DuckDuckGo HTML-Suche + eigener Impressum-Crawler, kostenlos, ohne API-Key, DSGVO-orientiert).

## Setup

```bash
# 1. Dependencies
npm install

# 2. Environment
cp .env.example .env
# AUTH_SECRET setzen (>= 32 Bytes), DATABASE_URL anpassen, optional OPENAI_API_KEY oder ANTHROPIC_API_KEY

# 3. Datenbank — Postgres lokal verfügbar machen, dann
npm run db:push        # Schema einspielen (für initialen MVP)
npm run db:seed        # Demo-Workspace + Demo-User anlegen

# 4. Dev-Server (läuft auf http://localhost:3100, damit Port 3000 frei bleibt)
npm run dev
```

Demo-Login (nach `db:seed`):
- E-Mail: `demo@product2lead.local`
- Passwort: `demo1234`

## Wichtige Skripte

| Befehl | Wirkung |
| --- | --- |
| `npm run dev` | Dev-Server (Turbopack) |
| `npm run build` | Production-Build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Prisma Client generieren |
| `npm run db:push` | Schema in DB synchronisieren (für MVP, ohne Migration) |
| `npm run db:migrate` | Migration erzeugen + anwenden |
| `npm run db:seed` | Demo-Daten |
| `npm run db:studio` | Prisma Studio |

## Projektstruktur

```
app/
  (auth)/login,(auth)/register      Auth-Pages
  (app)/dashboard,products,leads    Authentifizierte App-Routen
  api/leads/export                  CSV-Export (Route Handler)
  page.tsx                          Landingpage
components/
  ui/*                              Design System (Card, Button, Badge, …)
  app/*, auth/*, products/*, leads/*  Feature-Komponenten
lib/
  auth/                             Session, Passwords, Server Actions
  db/                               Prisma client singleton
  ai/                               AI-Adapter (mock/openai/anthropic), Prompts, Services
  research/                         Modulare Research-Engine (Mock-Provider, Scoring, Dedup)
  products/, leads/                 Server Actions
  utils/                            cn, format, csv
prisma/
  schema.prisma                     Datenmodell
  seed.ts                           Demo-Daten
proxy.ts                            Auth-Routing (Next 16 nennt es proxy statt middleware)
```

## DSGVO / Compliance (Architekturprinzipien)

- **Nur öffentliche B2B-Kontaktdaten** werden gesammelt (`info@`, `vertrieb@`, …). Persönliche Daten werden nur erfasst, wenn sie aus einer öffentlichen Quelle stammen, die mitgespeichert wird.
- **Quellen werden pro Lead persistiert** (`LeadSource`). Jeder Lead trägt mindestens eine Quelle.
- **Opt-Out vorbereitet:** `OptOutRequest`-Modell + Berücksichtigung in der Research-Engine, sodass entfernte Domains/E-Mails nicht erneut erfasst werden.
- **Keine automatische Massenzustellung:** E-Mails/Outreach-Nachrichten werden ausschließlich als `DRAFT` erzeugt; Versand erfolgt manuell durch den Nutzer.
- Echte Crawler werden später eingebaut: sie sollen `robots.txt` respektieren, Rate-Limits einhalten und keine geschlossenen Bereiche erschließen.

## Architekturdetails

### AI-Service-Layer (`lib/ai/`)
- `client.ts` wählt zur Laufzeit einen Adapter (`mock` / `openai` / `anthropic`) — bei fehlendem API-Key fällt der Service automatisch auf den Mock zurück.
- `prompts.ts` enthält versionierte Prompt-Templates inkl. `schemaName` + `schemaHint` für strukturierten JSON-Output.
- `productAnalysisService.ts` liefert die KI-Produktanalyse und persistiert sie in `ProductAnalysis`.
- `outreachService.ts` generiert E-Mail / LinkedIn / Follow-up / Telefon-Leitfaden — immer als `DRAFT`.

### Research-Engine (`lib/research/`)
- `companyDiscovery.ts` selektiert den aktiven Provider (`mock` oder `crawler`).
- `mockProvider.ts` liefert 12 fiktive Beispielfirmen für Demo-/Lokal-Modus.
- `crawlerProvider.ts` führt echte Recherche aus (DDG-Suche → Impressum-Parser).
- `search/duckduckgo.ts` postet die Query gegen `html.duckduckgo.com`.
- `crawler/siteCrawler.ts` findet Impressum-/Kontakt-Links auf der Homepage.
- `crawler/imprintParser.ts` extrahiert E-Mails (nur generische Rollen-Mailboxen!), Telefon, Adresse, Firma.
- `crawler/robots.ts` cached + respektiert robots.txt für jede Crawler-Domain.
- `crawler/rateLimiter.ts` throttelt 1 Req/Sec pro Host + globalen Spread.
- `queryGeneration.ts` erzeugt Suchqueries (über AI mit deterministischem Fallback).
- `dedup.ts` definiert den kanonischen Dedup-Key (eTLD+1 oder normalisierter Firmenname).
- `leadScoring.ts` berechnet einen transparenten 0–100-Score mit Begründung und Datenqualitätslabel.
- `researchService.ts` orchestriert: Analyse → Queries → Discovery → Scoring → Persistenz, schreibt `SearchRun`/`SearchQuery`/`Lead`/`LeadSource`/`Activity`/`UsageLog`.

### Auth
- `lib/auth/session.ts` schreibt/liest ein signiertes JWT-Cookie (`HS256`, 30 Tage, `httpOnly`, `lax`).
- `proxy.ts` (Next 16) leitet unauthentifizierte Anfragen zur `/login` und blockt eingeloggte Nutzer aus den Auth-Routen.

## Echte Recherche aktivieren

Setze in der `.env`:

```
RESEARCH_PROVIDER="crawler"
```

Beim nächsten Suchlauf liefert der eigene Crawler echte deutsche B2B-Firmen
mit ihren öffentlichen Impressum- und Kontaktseiten. Standardmäßig wird nach
generischen Rollen-Mailboxen (info@, vertrieb@, kontakt@ …) gefiltert; persönliche
E-Mails (vorname.nachname@) werden gezielt verworfen.

Polite-By-Default: 1 Request/Sekunde pro Host, robots.txt wird respektiert,
Timeout 8 Sekunden, max. 1.5 MB pro Seite. Der UI-Banner kennzeichnet den
Modus dauerhaft (gelb=Mock, grün=Crawler).

## Roadmap (kurz)

1. Migrationen statt `db push`, sobald der Schema-Stand stabil ist.
2. S3-/Object-Storage für Uploads (heute lokal in `/public/uploads`).
3. CRM-Pipeline-Board (Kanban) zusätzlich zur Tabelle.
4. Tests (vitest / playwright) für die kritischen Server Actions.
5. Branchenklassifikation der Crawler-Funde (heute leer, da nicht zuverlässig aus Impressum ableitbar).

Siehe `DEVELOPMENT_NOTES.md` für Architekturentscheidungen und Annahmen.
