import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { ConsolidateProductsButton } from "@/components/products/consolidate-button";
import { ProductsSearch } from "@/components/products/products-search";
import { formatDateShort } from "@/lib/utils/format";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 60;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const q = (sp.q as string | undefined)?.trim();
  const page = Math.max(1, parseInt((sp.page as string | undefined) ?? "1", 10));

  const where: Prisma.ProductWhereInput = {
    organizationId: user.organizationId,
    ...(q
      ? {
          OR: [
            { masterSku: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, withSku, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.count({
      where: { organizationId: user.organizationId, masterSku: { not: null } },
    }),
    prisma.product.findMany({
      where,
      orderBy: [{ masterSku: "asc" }, { createdAt: "desc" }],
      include: {
        analysis: { select: { id: true } },
        _count: { select: { leads: true, searchRuns: true } },
      },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const allCount = await prisma.product.count({
    where: { organizationId: user.organizationId },
  });
  const withoutSku = allCount - withSku;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produkte</h1>
          <p className="text-sm text-slate-500">
            {allCount} Produkte · {withSku} mit Master-SKU · {withoutSku} ohne
            {q ? <span> · gefiltert: {total} Treffer</span> : null}
          </p>
        </div>
        <div className="flex gap-2">
          {allCount > 0 ? <ConsolidateProductsButton /> : null}
          <Link href="/products/import"><Button variant="secondary">Bulk-Import</Button></Link>
          <Link href="/products/new"><Button>Neues Produkt</Button></Link>
        </div>
      </div>

      <ProductsSearch />

      {allCount === 0 ? (
        <EmptyState
          title="Noch kein Produkt angelegt"
          description="Mit einem Produkt startet die Reise: KI-Analyse, Suchläufe und Leadgenerierung."
          action={<Link href="/products/new"><Button size="sm">Erstes Produkt anlegen</Button></Link>}
        />
      ) : products.length === 0 ? (
        <EmptyState title="Keine Treffer" description={`Kein Produkt passt zu "${q ?? ""}".`} />
      ) : (
        <>
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

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Seite {page} / {totalPages}</span>
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
        </>
      )}
    </div>
  );
}

function pageHref(sp: Record<string, string | string[] | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") next.set(k, v);
  }
  next.set("page", String(page));
  return `/products?${next.toString()}`;
}
