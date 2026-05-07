import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, relativeFromNow } from "@/lib/utils/format";

export default async function AdminPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");

  const orgId = user.organizationId;

  const [users, products, runs, usage, optOuts, recentRuns, plan] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    }),
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.searchRun.count({ where: { organizationId: orgId } }),
    prisma.usageLog.groupBy({
      by: ["kind"],
      where: { organizationId: orgId },
      _sum: { count: true },
    }),
    prisma.optOutRequest.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.searchRun.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { product: { select: { name: true } } },
    }),
    prisma.subscriptionPlan.findUnique({ where: { organizationId: orgId } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-slate-500">Überblick über Nutzung, Nutzer und Compliance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Nutzer" value={users.length} hint="im Workspace" />
        <Stat label="Produkte" value={products} hint="verwaltet" />
        <Stat label="Suchläufe" value={runs} hint="gesamt" />
        <Stat
          label="Plan"
          value={(plan?.tier ?? "free").toUpperCase()}
          hint={plan ? `${plan.monthlyLeadLimit} Leads/Monat` : "—"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nutzer</CardTitle>
            <CardSubtitle>Mitglieder dieses Workspace.</CardSubtitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-slate-100">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium">{u.name ?? u.email}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </div>
                  <Badge variant={u.role === "ADMIN" ? "info" : "muted"}>{u.role.toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API-Nutzung</CardTitle>
            <CardSubtitle>Zähler aus dem UsageLog.</CardSubtitle>
          </CardHeader>
          <CardBody>
            {usage.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Nutzungsdaten.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {usage.map((u) => (
                  <li key={u.kind} className="flex items-center justify-between py-2 text-sm">
                    <span>{u.kind}</span>
                    <span className="font-medium tabular-nums">{u._sum.count ?? 0}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Letzte Suchläufe</CardTitle>
          </CardHeader>
          <CardBody>
            {recentRuns.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Suchläufe.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentRuns.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <div className="font-medium">{r.product.name}</div>
                      <div className="text-xs text-slate-500">
                        {r.newLeads}/{r.totalLeads} neu · {relativeFromNow(r.createdAt)}
                      </div>
                    </div>
                    <Badge variant={r.status === "COMPLETED" ? "success" : r.status === "FAILED" ? "danger" : "info"}>
                      {r.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Opt-Out-Liste</CardTitle>
            <CardSubtitle>Domains/E-Mails, die keine weitere Ansprache wünschen.</CardSubtitle>
          </CardHeader>
          <CardBody>
            {optOuts.length === 0 ? (
              <p className="text-sm text-slate-500">Keine Einträge.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {optOuts.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2">
                    <div>
                      <div>{o.email ?? o.domain}</div>
                      {o.reason ? <div className="text-xs text-slate-500">{o.reason}</div> : null}
                    </div>
                    <span className="text-xs text-slate-400">{formatDateTime(o.createdAt)}</span>
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

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardBody>
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
      </CardBody>
    </Card>
  );
}
