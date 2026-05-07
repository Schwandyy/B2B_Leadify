import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge, ScoreBar } from "@/components/ui/score";
import { StatusControl } from "@/components/leads/status-control";
import { NoteForm } from "@/components/leads/note-form";
import { OutreachPanel } from "@/components/leads/outreach-panel";
import { formatDateTime, relativeFromNow } from "@/lib/utils/format";

const SCORE_LABELS: Record<string, string> = {
  industryFit: "Branchenfit",
  productFit: "Produktfit",
  needSignals: "Bedarfssignale",
  contactQuality: "Kontaktqualität",
  region: "Region",
  strategicValue: "Strateg. Wert",
  dataQuality: "Datenqualität",
};

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      product: { select: { id: true, name: true } },
      sources: { orderBy: { fetchedAt: "asc" } },
      outreach: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true, email: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!lead) notFound();

  const breakdown = (lead.scoreBreakdown ?? {}) as Record<string, number>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/leads" className="text-xs text-slate-500 hover:text-slate-900">
            ← Leads
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{lead.companyName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Link href={`/products/${lead.product.id}`} className="hover:underline">
              {lead.product.name}
            </Link>
            <span>·</span>
            <span>{lead.industry ?? "Branche unbekannt"}</span>
            <span>·</span>
            <span>{[lead.city, lead.country].filter(Boolean).join(", ") || "Standort unbekannt"}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ScoreBadge score={lead.score} className="h-10 min-w-14 px-3 text-base" />
          <Badge variant={lead.dataQuality === "HIGH" ? "success" : lead.dataQuality === "MEDIUM" ? "info" : "muted"}>
            Datenqualität: {lead.dataQuality.toLowerCase()}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Firmenprofil</CardTitle>
              {lead.website ? (
                <CardSubtitle>
                  <a href={lead.website} target="_blank" rel="noreferrer" className="underline">
                    {lead.website}
                  </a>
                </CardSubtitle>
              ) : null}
            </CardHeader>
            <CardBody className="space-y-4">
              {lead.description ? <p className="text-sm text-slate-700">{lead.description}</p> : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="E-Mail" value={lead.contactEmail} link={lead.contactEmail ? `mailto:${lead.contactEmail}` : null} />
                <Field label="Telefon" value={lead.contactPhone} />
                <Field label="Kontaktseite" value={lead.contactPageUrl} link={lead.contactPageUrl} />
                <Field label="Impressum" value={lead.imprintUrl} link={lead.imprintUrl} />
                <Field label="Ansprechpartner" value={lead.contactPerson} />
                <Field label="Rolle" value={lead.contactRole} />
              </div>
              {lead.productsFound.length ? (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Sichtbare Produkte/Leistungen
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {lead.productsFound.map((p) => (
                      <Badge key={p} variant="muted">{p}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Relevanz & Score</CardTitle>
              <CardSubtitle>Transparente Begründung der Bewertung.</CardSubtitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {lead.relevanceReason ? (
                <p className="text-sm text-slate-700">{lead.relevanceReason}</p>
              ) : null}
              {lead.needSignals.length ? (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Bedarfssignale
                  </h4>
                  <ul className="list-disc pl-4 text-sm text-slate-700">
                    {lead.needSignals.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(breakdown).map(([k, v]) => (
                  <div key={k}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">{SCORE_LABELS[k] ?? k}</span>
                      <span className="tabular-nums text-slate-500">{v}</span>
                    </div>
                    <ScoreBar score={Math.min(100, v * 4)} />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outreach</CardTitle>
              <CardSubtitle>
                E-Mail, LinkedIn, Telefon-Leitfaden — alles als Entwurf, manuelle Freigabe vor Versand.
              </CardSubtitle>
            </CardHeader>
            <CardBody>
              <OutreachPanel leadId={lead.id} messages={lead.outreach} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <NoteForm leadId={lead.id} />
              {lead.notes.length === 0 ? (
                <p className="text-sm text-slate-500">Noch keine Notizen.</p>
              ) : (
                <ul className="space-y-3">
                  {lead.notes.map((n) => (
                    <li key={n.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                      <p className="text-slate-700">{n.body}</p>
                      <div className="mt-1 text-xs text-slate-400">
                        {n.author.name ?? n.author.email} · {relativeFromNow(n.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardSubtitle>CRM-Pipeline-Position</CardSubtitle>
            </CardHeader>
            <CardBody>
              <StatusControl leadId={lead.id} current={lead.status} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quellen</CardTitle>
              <CardSubtitle>Öffentlich auffindbar — DSGVO-orientiert.</CardSubtitle>
            </CardHeader>
            <CardBody>
              {lead.sources.length === 0 ? (
                <p className="text-sm text-slate-500">Keine Quellen gespeichert.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {lead.sources.map((s) => (
                    <li key={s.id} className="break-words">
                      <a href={s.url} target="_blank" rel="noreferrer" className="font-medium underline">
                        {s.url.replace(/^https?:\/\//, "")}
                      </a>
                      <div className="text-xs text-slate-500">{s.kind}</div>
                      {s.excerpt ? <p className="mt-1 text-xs text-slate-500">{s.excerpt}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aktivitätsverlauf</CardTitle>
            </CardHeader>
            <CardBody>
              {lead.activities.length === 0 ? (
                <p className="text-sm text-slate-500">Keine Aktivitäten.</p>
              ) : (
                <ol className="space-y-3 text-sm">
                  {lead.activities.map((a) => (
                    <li key={a.id} className="border-l-2 border-slate-200 pl-3">
                      <div className="text-slate-700">{a.message}</div>
                      <div className="text-xs text-slate-400">
                        {a.kind} · {formatDateTime(a.createdAt)}
                        {a.user ? ` · ${a.user.name ?? a.user.email}` : ""}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, link }: { label: string; value?: string | null; link?: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      {value ? (
        link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-sm text-slate-900 underline">
            {value}
          </a>
        ) : (
          <div className="text-sm text-slate-900">{value}</div>
        )
      ) : (
        <div className="text-sm text-slate-400">—</div>
      )}
    </div>
  );
}
