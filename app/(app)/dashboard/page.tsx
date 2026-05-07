import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score";
import { EmptyState } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { relativeFromNow } from "@/lib/utils/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const orgId = user.organizationId;

  const [productCount, totalLeads, openLeads, contactedLeads, topLeads, recentRuns] = await Promise.all([
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.lead.count({ where: { organizationId: orgId } }),
    prisma.lead.count({ where: { organizationId: orgId, status: { in: ["NEW", "REVIEWED", "RELEVANT"] } } }),
    prisma.lead.count({ where: { organizationId: orgId, status: { in: ["CONTACTED", "REPLIED", "MEETING_BOOKED", "OFFER_SENT", "WON"] } } }),
    prisma.lead.findMany({
      where: { organizationId: orgId },
      orderBy: { score: "desc" },
      take: 5,
      include: { product: { select: { name: true } } },
    }),
    prisma.searchRun.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { product: { select: { name: true } } },
    }),
  ]);

  const kpis = [
    { label: "Produkte", value: productCount, hint: "verwaltet" },
    { label: "Leads gesamt", value: totalLeads, hint: "alle Status" },
    { label: "Offene Leads", value: openLeads, hint: "neu / geprüft / relevant" },
    { label: "Kontaktiert", value: contactedLeads, hint: "in der Pipeline" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500">Überblick über Produkte, Suchläufe und Leads.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/products/new"><Button>Neues Produkt</Button></Link>
          <Link href="/leads"><Button variant="secondary">Leads öffnen</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardBody>
              <div className="text-xs uppercase tracking-wide text-slate-500">{k.label}</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{k.value}</div>
              <div className="mt-1 text-xs text-slate-400">{k.hint}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top-Leads</CardTitle>
            <CardSubtitle>Die fünf höchsten Scores in Ihrem Workspace.</CardSubtitle>
          </CardHeader>
          <CardBody>
            {topLeads.length === 0 ? (
              <EmptyState
                title="Noch keine Leads"
                description="Lege ein Produkt an und starte einen Suchlauf, um Leads zu generieren."
                action={<Link href="/products/new"><Button size="sm">Produkt anlegen</Button></Link>}
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {topLeads.map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between py-3">
                    <div>
                      <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                        {lead.companyName}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {lead.industry ?? "—"} · {lead.product.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="muted">{lead.status.toLowerCase()}</Badge>
                      <ScoreBadge score={lead.score} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Letzte Suchläufe</CardTitle>
            <CardSubtitle>Status und gefundene Leads pro Run.</CardSubtitle>
          </CardHeader>
          <CardBody>
            {recentRuns.length === 0 ? (
              <EmptyState
                title="Noch keine Suchläufe"
                description="Suchläufe entstehen automatisch beim Anstoßen einer Lead-Recherche."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentRuns.map((run) => (
                  <li key={run.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{run.product.name}</div>
                      <div className="text-xs text-slate-500">{relativeFromNow(run.createdAt)}</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <Badge variant={run.status === "COMPLETED" ? "success" : run.status === "FAILED" ? "danger" : "info"}>
                        {run.status.toLowerCase()}
                      </Badge>
                      <span>
                        {run.newLeads}/{run.totalLeads} neu
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
