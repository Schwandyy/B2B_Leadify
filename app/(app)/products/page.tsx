import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { ConsolidateProductsButton } from "@/components/products/consolidate-button";
import { formatDateShort } from "@/lib/utils/format";

export default async function ProductsPage() {
  const user = await requireUser();
  const products = await prisma.product.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ masterSku: "asc" }, { createdAt: "desc" }],
    include: {
      analysis: { select: { id: true } },
      _count: { select: { leads: true, searchRuns: true } },
    },
  });

  const withSku = products.filter((p) => p.masterSku).length;
  const withoutSku = products.length - withSku;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produkte</h1>
          <p className="text-sm text-slate-500">
            {products.length} Produkte · {withSku} mit Master-SKU · {withoutSku} ohne
          </p>
        </div>
        <div className="flex gap-2">
          {withoutSku > 0 ? <ConsolidateProductsButton /> : null}
          <Link href="/products/import"><Button variant="secondary">Bulk-Import</Button></Link>
          <Link href="/products/new"><Button>Neues Produkt</Button></Link>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="Noch kein Produkt angelegt"
          description="Mit einem Produkt startet die Reise: KI-Analyse, Suchläufe und Leadgenerierung."
          action={<Link href="/products/new"><Button size="sm">Erstes Produkt anlegen</Button></Link>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const variantCount = Array.isArray(p.variants) ? p.variants.length : 0;
            const headline = p.masterSku ?? p.name;
            const subtitle = p.masterSku ? p.name : p.category ?? "Ohne Kategorie";
            return (
              <Card key={p.id}>
                <CardHeader>
                  <CardTitle>
                    <Link href={`/products/${p.id}`} className="hover:underline">
                      {p.masterSku ? (
                        <span className="font-mono text-base">{headline}</span>
                      ) : (
                        headline
                      )}
                    </Link>
                  </CardTitle>
                  <CardSubtitle className="truncate">{subtitle}</CardSubtitle>
                </CardHeader>
                <CardBody>
                  <p className="line-clamp-3 text-sm text-slate-600">{p.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {variantCount > 0 ? (
                      <Badge variant="info">{variantCount} Varianten</Badge>
                    ) : null}
                    <Badge variant={p.analysis ? "success" : "warning"}>
                      {p.analysis ? "KI-Analyse vorhanden" : "Analyse ausstehend"}
                    </Badge>
                    <Badge variant="muted">{p._count.leads} Leads</Badge>
                    <Badge variant="muted">{p._count.searchRuns} Suchläufe</Badge>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    {p.category ?? "Ohne Kategorie"} · {formatDateShort(p.createdAt)}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
