import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score";
import { Button } from "@/components/ui/button";
import { LeadsFilters } from "@/components/leads/leads-filters";
import type { LeadStatus, Prisma } from "@prisma/client";

const PAGE_SIZE = 25;

const STATUSES = new Set([
  "NEW",
  "REVIEWED",
  "RELEVANT",
  "CONTACTED",
  "REPLIED",
  "MEETING_BOOKED",
  "OFFER_SENT",
  "WON",
  "LOST",
  "ARCHIVED",
]);

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireUser();

  const q = (sp.q as string | undefined)?.trim();
  const productId = sp.productId as string | undefined;
  const statusRaw = sp.status as string | undefined;
  const status = statusRaw && STATUSES.has(statusRaw) ? (statusRaw as LeadStatus) : undefined;
  const minScore = sp.minScore ? parseInt(sp.minScore as string, 10) : undefined;
  const hasContact = sp.hasContact as string | undefined;
  const page = Math.max(1, parseInt((sp.page as string | undefined) ?? "1", 10));

  const where: Prisma.LeadWhereInput = {
    organizationId: user.organizationId,
    ...(productId ? { productId } : {}),
    ...(status ? { status } : {}),
    ...(typeof minScore === "number" && !Number.isNaN(minScore) ? { score: { gte: minScore } } : {}),
    ...(hasContact === "yes"
      ? { OR: [{ contactEmail: { not: null } }, { contactPhone: { not: null } }] }
      : hasContact === "no"
        ? { contactEmail: null, contactPhone: null }
        : {}),
    ...(q
      ? {
          OR: [
            { companyName: { contains: q, mode: "insensitive" } },
            { industry: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { country: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [products, total, rows] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { product: { select: { name: true } } },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") exportQuery.set(k, v);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-slate-500">{total} Treffer · gefiltert</p>
        </div>
        <a href={`/api/leads/export?${exportQuery.toString()}`}>
          <Button variant="secondary">CSV exportieren</Button>
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardSubtitle>Kombiniere Felder, um relevante Leads schnell zu finden.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <LeadsFilters products={products} />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">Keine Leads für diese Filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Firma</th>
                    <th className="py-2 pr-4">Branche</th>
                    <th className="py-2 pr-4">Standort</th>
                    <th className="py-2 pr-4">Kontakt</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Produkt</th>
                    <th className="py-2 pr-4 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-4">
                        <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:underline">
                          {lead.companyName}
                        </Link>
                        {lead.website ? (
                          <div className="text-xs text-slate-400">{lead.website.replace(/^https?:\/\//, "")}</div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">{lead.industry ?? "—"}</td>
                      <td className="py-2 pr-4 text-slate-600">
                        {[lead.city, lead.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {lead.contactEmail || lead.contactPhone || "—"}
                      </td>
                      <td className="py-2 pr-4"><Badge variant="muted">{lead.status.toLowerCase()}</Badge></td>
                      <td className="py-2 pr-4 text-slate-600">{lead.product.name}</td>
                      <td className="py-2 pr-4 text-right"><ScoreBadge score={lead.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Seite {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(sp, page - 1)}>
                <Button variant="secondary" size="sm">Zurück</Button>
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={pageHref(sp, page + 1)}>
                <Button variant="secondary" size="sm">Weiter</Button>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pageHref(sp: Record<string, string | string[] | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") next.set(k, v);
  }
  next.set("page", String(page));
  return `/leads?${next.toString()}`;
}
