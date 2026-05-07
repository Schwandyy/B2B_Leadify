import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/ui/score";
import { EmptyState } from "@/components/ui/empty";
import { AnalyzeButton, StartSearchButton } from "@/components/products/product-actions";
import { formatDateShort, relativeFromNow } from "@/lib/utils/format";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const product = await prisma.product.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      analysis: true,
      searchRuns: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { leads: true } },
    },
  });
  if (!product) notFound();

  const topLeads = await prisma.lead.findMany({
    where: { productId: product.id, organizationId: user.organizationId },
    orderBy: { score: "desc" },
    take: 5,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/products" className="text-xs text-slate-500 hover:text-slate-900">
            ← Produkte
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {product.masterSku ? (
              <>
                <span className="font-mono">{product.masterSku}</span>
                <span className="text-slate-400"> — </span>
              </>
            ) : null}
            {product.name}
          </h1>
          <p className="text-sm text-slate-500">
            {product.category ?? "Ohne Kategorie"} · {product.targetRegion ?? "Region offen"} · angelegt am{" "}
            {formatDateShort(product.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AnalyzeButton productId={product.id} hasAnalysis={Boolean(product.analysis)} />
          <StartSearchButton productId={product.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Beschreibung</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="whitespace-pre-line text-sm text-slate-700">{product.description}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                {product.keywords.map((k) => (
                  <Badge key={k} variant="info">{k}</Badge>
                ))}
                {product.exclusions.map((k) => (
                  <Badge key={k} variant="danger">!{k}</Badge>
                ))}
                {product.targetCustomerTypes.map((t) => (
                  <Badge key={t} variant="muted">{t.toLowerCase()}</Badge>
                ))}
              </div>
              {product.attachmentPath ? (
                <div className="mt-3 text-sm">
                  <a className="font-medium underline" href={product.attachmentPath} target="_blank" rel="noreferrer">
                    Anhang öffnen
                  </a>
                </div>
              ) : null}
              {product.productUrl ? (
                <div className="mt-1 text-sm">
                  <a className="font-medium underline" href={product.productUrl} target="_blank" rel="noreferrer">
                    Produktseite besuchen
                  </a>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <ProductVariantsCard variants={product.variants as unknown as Array<Record<string, unknown>> | null} />


          <Card>
            <CardHeader>
              <CardTitle>KI-Produktanalyse</CardTitle>
              <CardSubtitle>Generiert vom AI-Service-Layer (Mock oder Provider).</CardSubtitle>
            </CardHeader>
            <CardBody>
              {!product.analysis ? (
                <EmptyState
                  title="Noch keine Analyse"
                  description="Starte die KI-Analyse, um Branchen, Käuferrollen und Suchstrategie zu erhalten."
                  action={<AnalyzeButton productId={product.id} hasAnalysis={false} />}
                />
              ) : (
                <div className="space-y-5 text-sm">
                  <Section title="Kurzbeschreibung">{product.analysis.shortDescription}</Section>
                  <Section title="Nutzenversprechen">{product.analysis.valueProposition}</Section>
                  <ListSection title="Probleme, die das Produkt löst" items={product.analysis.problemsSolved} />
                  <ListSection title="Relevante Branchen" items={product.analysis.relevantIndustries} />
                  <ListSection title="Käuferrollen" items={product.analysis.buyerRoles} />
                  <ListSection title="Mögliche Firmenarten" items={product.analysis.companyTypes} />
                  <ListSection title="Suchbegriffe" items={product.analysis.searchTerms} />
                  <ListSection title="Wettbewerber / Schnittmengen" items={product.analysis.competitorOverlap} />
                  <ListSection title="Akquise-Argumente" items={product.analysis.pitchArguments} />
                  <ListSection title="Mögliche Einwände" items={product.analysis.objections} />
                  <Section title="Empfohlene Suchstrategie">{product.analysis.searchStrategy}</Section>
                  <p className="text-xs text-slate-400">
                    Modell: {product.analysis.model ?? "—"} · aktualisiert {relativeFromNow(product.analysis.updatedAt)}
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top-Leads</CardTitle>
              <CardSubtitle>Bestbewertete Leads dieses Produkts.</CardSubtitle>
            </CardHeader>
            <CardBody>
              {topLeads.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Noch keine Leads — starte einen Suchlauf, um sie zu generieren.
                </p>
              ) : (
                <ul className="space-y-3">
                  {topLeads.map((lead) => (
                    <li key={lead.id} className="flex items-center justify-between">
                      <Link href={`/leads/${lead.id}`} className="text-sm font-medium hover:underline">
                        {lead.companyName}
                      </Link>
                      <ScoreBadge score={lead.score} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <Link href={`/leads?productId=${product.id}`}>
                  <Button variant="secondary" size="sm" className="w-full">
                    Alle {product._count.leads} Leads ansehen
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Letzte Suchläufe</CardTitle>
            </CardHeader>
            <CardBody>
              {product.searchRuns.length === 0 ? (
                <p className="text-sm text-slate-500">Noch keine Suchläufe.</p>
              ) : (
                <ul className="space-y-3">
                  {product.searchRuns.map((run) => (
                    <li key={run.id} className="flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium">{relativeFromNow(run.createdAt)}</div>
                        <div className="text-xs text-slate-500">{run.newLeads} neue Leads</div>
                      </div>
                      <Badge variant={run.status === "COMPLETED" ? "success" : run.status === "FAILED" ? "danger" : "info"}>
                        {run.status.toLowerCase()}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <p className="text-slate-700">{children}</p>
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <ul className="flex flex-wrap gap-2">
        {items.map((it) => (
          <li key={it}>
            <Badge variant="muted">{it}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

type VariantRow = {
  label?: string;
  sku?: string;
  packSize?: number;
  price?: number;
  url?: string;
};

function ProductVariantsCard({ variants }: { variants: Array<Record<string, unknown>> | null }) {
  if (!variants || !Array.isArray(variants) || variants.length === 0) return null;
  const rows = variants as VariantRow[];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Varianten ({rows.length})</CardTitle>
        <CardSubtitle>Pack-Größen / SKUs, die unter dieser Master-SKU zusammengefasst sind.</CardSubtitle>
      </CardHeader>
      <CardBody>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4">Label</th>
                <th className="py-2 pr-4">SKU / ASIN</th>
                <th className="py-2 pr-4">Pack-Größe</th>
                <th className="py-2 pr-4 text-right">Preis</th>
                <th className="py-2 pr-4">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((v, i) => (
                <tr key={`${v.sku ?? ""}-${i}`}>
                  <td className="py-2 pr-4 font-medium text-slate-900">{v.label ?? "—"}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-700">{v.sku ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums text-slate-600">{v.packSize ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                    {typeof v.price === "number" ? v.price.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {v.url ? (
                      <a className="underline" href={v.url} target="_blank" rel="noreferrer">
                        öffnen
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
