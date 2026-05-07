import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { ConsolidateProductsButton } from "@/components/products/consolidate-button";
import { ProductsSearch } from "@/components/products/products-search";
import { ProductsViewToggle, type ProductsView } from "@/components/products/view-toggle";
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
  const view: ProductsView = (sp.view as string | undefined) === "grid" ? "grid" : "list";

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

  // Lagerbestand: Map AZ-Code → verfügbarer Bestand für die Produkte
  // dieser Seite. Leer, wenn (a) keine SKU oder (b) keine Snapshot-Zeile.
  const skusOnPage = products
    .map((p) => p.masterSku)
    .filter((s): s is string => Boolean(s));
  const stockRows =
    skusOnPage.length > 0
      ? await prisma.inventorySnapshot.findMany({
          where: {
            organizationId: user.organizationId,
            masterSku: { in: skusOnPage },
          },
          select: { masterSku: true, availableStock: true },
        })
      : [];
  const stockBySku = new Map(stockRows.map((r) => [r.masterSku, r.availableStock]));

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
        <div className="flex flex-wrap items-center gap-2">
          <ProductsViewToggle current={view} />
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
      ) : view === "grid" ? (
        <ProductsGrid products={products} stockBySku={stockBySku} />
      ) : (
        <ProductsTable products={products} stockBySku={stockBySku} />
      )}

      {totalPages > 1 && products.length > 0 ? (
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
    </div>
  );
}

type Row = {
  id: string;
  masterSku: string | null;
  name: string;
  description: string;
  category: string | null;
  createdAt: Date;
  variants: unknown;
  analysis: { id: string } | null;
  _count: { leads: number; searchRuns: number };
};

function ProductsGrid({
  products,
  stockBySku,
}: {
  products: Row[];
  stockBySku: Map<string, number>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => {
        const variantCount = Array.isArray(p.variants) ? p.variants.length : 0;
        const headline = p.masterSku ?? p.name;
        const subtitle = p.masterSku ? p.name : p.category ?? "Ohne Kategorie";
        const stock = p.masterSku ? stockBySku.get(p.masterSku) : undefined;
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
                {stock !== undefined ? (
                  <Badge variant={stock > 0 ? "success" : "danger"}>
                    {stock > 0 ? `${stock} auf Lager` : "Ausverkauft"}
                  </Badge>
                ) : null}
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
  );
}

function ProductsTable({
  products,
  stockBySku,
}: {
  products: Row[];
  stockBySku: Map<string, number>;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">AZ-Code</th>
            <th className="px-4 py-2.5 font-medium">Produktname</th>
            <th className="px-4 py-2.5 font-medium">Kategorie</th>
            <th className="px-3 py-2.5 text-right font-medium">Bestand</th>
            <th className="px-3 py-2.5 text-center font-medium">Varianten</th>
            <th className="px-3 py-2.5 text-center font-medium">KI</th>
            <th className="px-3 py-2.5 text-right font-medium">Leads</th>
            <th className="px-3 py-2.5 text-right font-medium">Runs</th>
            <th className="px-4 py-2.5 font-medium">Angelegt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((p) => {
            const variantCount = Array.isArray(p.variants) ? p.variants.length : 0;
            const stock = p.masterSku ? stockBySku.get(p.masterSku) : undefined;
            return (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                  {p.masterSku ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/products/${p.id}`} className="font-medium text-slate-900 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{p.category ?? "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {stock === undefined ? (
                    <span className="text-slate-300">—</span>
                  ) : stock > 0 ? (
                    <span className="text-slate-900">{stock}</span>
                  ) : (
                    <span className="font-medium text-rose-600">0</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">
                  {variantCount > 0 ? variantCount : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {p.analysis ? (
                    <Badge variant="success">✓</Badge>
                  ) : (
                    <Badge variant="muted">—</Badge>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{p._count.leads}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{p._count.searchRuns}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDateShort(p.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
