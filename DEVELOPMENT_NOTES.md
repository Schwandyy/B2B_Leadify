# Development Notes — Product2Lead AI

Lebt mit dem Projekt. Architekturentscheidungen, Annahmen, offene Punkte.

## Repository-Ausgangslage (Mai 2026)

- `Schwandyy/B2B_Leadify` war beim Start leer — kein bestehender Code, keine Conventions, keine ER-Modelle.
- Stack-Wahl daher gemäß Spezifikation: Next.js 16 (TypeScript, App Router), Tailwind CSS v4, Prisma + Postgres.
- `AGENTS.md` weist explizit darauf hin, dass Next.js 16 Breaking Changes gegenüber 14/15 hat — relevant für uns:
  - `middleware.ts` heißt jetzt `proxy.ts` und exportiert eine `proxy(request)`-Funktion.
  - `params` und `searchParams` sind in `page.tsx` Promises (`await`).
  - `cookies()` aus `next/headers` ist async.

## Auth-Entscheidung (Eigenbau statt Auth.js)

Auth.js / `next-auth@5.0.0-beta` deklariert Peer-Dependencies auf Next 14/15 — nicht 16. Das hätten wir mit `--legacy-peer-deps` erzwingen können, aber:

- Beta-Status + nicht offiziell für Next 16 zertifiziert
- Sehr begrenzter Bedarf im MVP (E-Mail+Passwort, Multi-Tenancy, Rollen)

Stattdessen: signed JWT cookie via `jose` + `bcryptjs` für Passwörter. Vorteile: keine Beta-Abhängigkeit, voll kontrollierbar, wenig Code (`lib/auth/session.ts` ~80 Zeilen). Nachteile: kein OAuth out-of-the-box — wenn Google/Microsoft-SSO nötig wird, sollte später auf `next-auth` migriert werden, sobald Next-16-Support stabil ist.

## Datenmodell-Entscheidungen

- **Multi-Tenancy:** Jeder Datensatz hat `organizationId`. Konsistente Indizes auf diesen Spalten. Beim Login wird die `oid` ins JWT geschrieben, alle Queries filtern darauf.
- **Erstnutzer wird Admin:** Wer einen Workspace registriert, wird automatisch `ADMIN`. Reicht für MVP, Einladungen kommen später.
- **Dedup:** `dedupKey` ist die kanonische eTLD+1 der Firmenwebsite (oder ein slugifizierter Firmenname). Unique-Index `(organizationId, productId, dedupKey)` verhindert Doppelte Leads pro Produkt.
- **Lead-Score** wird als `Int 0-100` plus `scoreBreakdown JSON` gespeichert — die Begründung wird zusätzlich als Klartext in `relevanceReason` abgelegt, damit auch ohne JSON-Inspektor klar ist, warum ein Lead bewertet wurde.
- **DataQuality** ist ein Enum (`HIGH`, `MEDIUM`, `LOW`) und wird vom Scoring abgeleitet.
- **Outreach-Nachrichten** haben einen Status `DRAFT → APPROVED → SENT`. Versand selbst ist nicht implementiert (bewusst, siehe DSGVO unten).

## Mock-First-Ansatz

- **AI-Provider:** Default `mock`. Ist ein API-Key gesetzt, schaltet `getAIClient()` automatisch auf OpenAI/Anthropic. So lässt sich die App komplett ohne Secrets entwickeln.
- **Research-Provider:** Aktuell nur Mock. Architektur bewusst so gewählt, dass `companyDiscovery.ts` einen weiteren Adapter (z. B. Brave Search API + HTML-Parser) ohne UI-Änderung aufnehmen kann.
- Mock-Daten sind **plausibel, aber fiktiv** — Domains tragen `-example.de/.at/.ch` als Marker.

## DSGVO / Compliance

- Outreach-Mails werden bewusst nur als Draft erzeugt. Es gibt keinen Mass-Send, kein SMTP-Hook. Das ist eine Architekturentscheidung — es soll nicht versehentlich Spam entstehen.
- `OptOutRequest`-Modell ist vorhanden; die Research-Engine prüft bei jedem Run gegen die Liste.
- Quellen werden pro Lead gespeichert. Wenn echte Crawler eingebaut werden: `robots.txt` respektieren, Rate-Limits einhalten, Excerpts begrenzen.
- Persönliche Daten (`contactPerson`, `contactRole`) werden nur erfasst, wenn sie öffentlich auffindbar sind.

## Bekannte offene Punkte / TODO

- [ ] Migrationen: aktuell `db push`. Sobald das Schema stabil ist, `prisma migrate dev` als Standard-Workflow.
- [ ] Datei-Uploads: heute `public/uploads/` (lokal). Für Produktion: S3 / R2 Adapter.
- [ ] Tests: keine vorhanden. Wichtig wären erste Tests für `leadScoring`, `dedupKey`, `productAnalysisService` (mit Mock-AI).
- [ ] Real-Search-Provider (`research/` adapter), inklusive robots.txt + Rate-Limit.
- [ ] CRM-Pipeline-Board (Kanban) ergänzt sinnvoll die Tabelle.
- [ ] Einladungs-Flow für weitere User (heute nur Self-Registration → Org wird erstellt).
- [ ] CRM-Export-Adapter (HubSpot, Pipedrive). Architektur-Skelett analog zu Research geplant.
- [ ] Internationalisierung: UI ist heute komplett auf Deutsch.

## Annahmen, die explizit getroffen wurden

1. Region-Codes sind frei (`DE`, `DACH`, `EU`, `WORLD`). Sind keine ISO-Codes — bewusst, weil DACH kein ISO-Konstrukt ist.
2. `priceRangeMin/Max` als Ganzzahlen + 3-stelliger `currency`-Code (Standard `EUR`).
3. Score wird im Range 0–100 abgebildet und mit einer Heuristik berechnet (`leadScoring.ts`). Die Gewichte sind als Konstanten dokumentiert und einfach zu tunen.
4. „Erster User wird Admin“ ist Workspace-spezifisch; für eine Multi-Org-Plattform müsste die Trennung verfeinert werden.

## Commit-Struktur (vorgeschlagen)

Der MVP-Aufbau lässt sich in folgende logische Commits zerlegen — kann beim ersten Push so aufgeteilt werden:

1. `chore: bootstrap next.js + tailwind + prisma + tooling`
2. `feat: data model (organization, user, product, lead, outreach, …)`
3. `feat: auth (session, login, register, proxy)`
4. `feat: ai service layer with provider adapters and prompt registry`
5. `feat: research engine with mock provider + scoring + dedup`
6. `feat: dashboard, products, leads, outreach UI`
7. `feat: csv export + admin overview + seed data`
8. `docs: README + DEVELOPMENT_NOTES`
