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
import { formatDateShort, relativeFromNow } from "@/lib/utils/format";
import type { Prisma } from "@prisma/client";

const STALE_AFTER_DAYS = 7;

const PAGE_SIZE = 60;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const q = (sp.q as string | undefined)?.trim();
  const stockFilter = (sp.stock as string | undefined) ?? "all";
  const page = Math.max(1, parseInt((sp.page as string | undefined) ?? "1", 10));
  const view: ProductsView = (sp.view as string | undefined) === "grid" ? "grid" : "list";

  // Bestandsfilter: vor dem Hauptquery die SKUs holen, die zum gewählten
  // Bucket passen, dann als IN/NOT IN auf Product.masterSku anwenden.
  const skuFilter = await buildStockSkuFilter(stockFilter, user.organizationId);

  const conditions: Prisma.ProductWhereInput[] = [];
  if (skuFilter) conditions.push({ masterSku: skuFilter });
  if (q) {
    conditions.push({
      OR: [
        { masterSku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const where: Prisma.ProductWhereInput = {
    organizationId: user.organizationId,
    ...(conditions.length > 0 ? { AND: conditions } : {}),
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

  const inventorySource = await prisma.inventorySource.findUnique({
    where: { organizationId: user.organizationId },
    select: { lastSyncedAt: true, lastError: true },
  });
  const inventoryAgeDays = inventorySource?.lastSyncedAt
    ? computeAgeDays(inventorySource.lastSyncedAt)
    : Number.POSITIVE_INFINITY;

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
            {q || stockFilter !== "all" ? (
              <span> · gefiltert: {total} Treffer</span>
            ) : null}
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

      {inventorySource ? (
        <InventoryStatus
          source={inventorySource}
          isAdmin={user.role === "ADMIN"}
          ageDays={inventoryAgeDays}
        />
      ) : null}

      {allCount === 0 ? (
        <EmptyState
          title="Noch kein Produkt angelegt"
          description="Mit einem Produkt startet die Reise: KI-Analyse, Suchläufe und Leadgenerierung."
          action={<Link href="/products/new"><Button size="sm">Erstes Produkt anlegen</Button></Link>}
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="Keine Treffer"
          description={emptyStateText(q, stockFilter)}
        />
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

function InventoryStatus({
  source,
  isAdmin,
  ageDays,
}: {
  source: { lastSyncedAt: Date | null; lastError: string | null };
  isAdmin: boolean;
  ageDays: number;
}) {
  const stale = ageDays > STALE_AFTER_DAYS;
  const hasError = Boolean(source.lastError);

  let tone: "ok" | "warn" | "err";
  let label: string;
  if (hasError) {
    tone = "err";
    label = "Bestand-Sync fehlgeschlagen";
  } else if (!source.lastSyncedAt) {
    tone = "warn";
    label = "Bestand noch nicht synchronisiert";
  } else if (stale) {
    tone = "warn";
    label = `Bestand zuletzt aktualisiert ${relativeFromNow(source.lastSyncedAt)}`;
  } else {
    tone = "ok";
    label = `Bestand aktualisiert ${relativeFromNow(source.lastSyncedAt)}`;
  }

  const styles =
    tone === "err"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2 text-xs ${styles}`}
    >
      <span>{label}</span>
      {isAdmin ? (
        <Link href="/admin/inventory" className="font-medium underline-offset-2 hover:underline">
          {hasError || stale || !source.lastSyncedAt ? "Jetzt aktualisieren →" : "Verwalten"}
        </Link>
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
  return `/products?${next.toString()}`;
}

function computeAgeDays(syncedAt: Date): number {
  return (Date.now() - syncedAt.getTime()) / 86_400_000;
}

function emptyStateText(q: string | undefined, stockFilter: string): string {
  const filters: string[] = [];
  if (q) filters.push(`Suche „${q}"`);
  const stockLabel: Record<string, string> = {
    in_stock: "Auf Lager",
    low: "Niedriger Bestand (1–10)",
    out: "Ausverkauft",
    none: "Ohne Bestandsdaten",
  };
  if (stockFilter && stockLabel[stockFilter]) filters.push(`Bestand: ${stockLabel[stockFilter]}`);
  return filters.length > 0 ? `Kein Produkt passt zu: ${filters.join(" · ")}.` : "Kein Produkt gefunden.";
}

/**
 * Baut den masterSku-Filter (in/notIn) für den gewählten Bestand-Bucket.
 * "all" → null (kein Filter); andere Buckets → konkrete SKU-Liste.
 */
async function buildStockSkuFilter(
  stockFilter: string,
  organizationId: string,
): Promise<{ in: string[] } | { notIn: string[] } | null> {
  if (stockFilter === "all" || !stockFilter) return null;

  if (stockFilter === "none") {
    const all = await prisma.inventorySnapshot.findMany({
      where: { organizationId },
      select: { masterSku: true },
    });
    // Falls noch keine Snapshots existieren, würde "notIn: []" alle Produkte
    // zurückliefern — das wäre verwirrend. Stattdessen: leerer Filter.
    if (all.length === 0) return null;
    return { notIn: all.map((s) => s.masterSku) };
  }

  let stockCondition: Prisma.IntFilter | number = 0;
  if (stockFilter === "in_stock") stockCondition = { gt: 0 };
  else if (stockFilter === "low") stockCondition = { gt: 0, lte: 10 };
  else if (stockFilter === "out") stockCondition = 0;
  else return null;

  const matching = await prisma.inventorySnapshot.findMany({
    where: { organizationId, availableStock: stockCondition },
    select: { masterSku: true },
  });
  // "in: []" findet nichts — gewünschtes Verhalten: kein Treffer für leere
  // Buckets statt aller Produkte.
  return { in: matching.map((s) => s.masterSku) };
}
