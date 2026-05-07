import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryForm } from "@/components/admin/inventory-form";
import { ResyncProductsButton } from "@/components/admin/resync-products-button";
import { formatDateTime, relativeFromNow } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function InventoryAdminPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");

  const orgId = user.organizationId;
  const [source, snapshotCount, matched] = await Promise.all([
    prisma.inventorySource.findUnique({ where: { organizationId: orgId } }),
    prisma.inventorySnapshot.count({ where: { organizationId: orgId } }),
    prisma.product.count({
      where: {
        organizationId: orgId,
        masterSku: { in: await listSnapshotSkus(orgId) },
      },
    }),
  ]);

  const initial = source
    ? {
        sheetUrl: source.sheetUrl,
        description: source.description ?? "",
        skuColumn: source.skuColumn,
        stockColumn: source.stockColumn,
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lagerbestand</h1>
        <p className="text-sm text-slate-500">
          Externe Bestandsdaten per Google-Sheet einlesen. Wird wöchentlich
          (Mo 06:00 UTC) automatisch aktualisiert; manuell jederzeit möglich.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Quelle" value={source ? "konfiguriert" : "—"} hint={source ? "Sheet hinterlegt" : "noch nicht eingerichtet"} />
        <Stat label="Bestände in DB" value={snapshotCount} hint="Zeilen aus dem letzten Sync" />
        <Stat label="Treffer mit Produkt" value={matched} hint="per AZ-Code zugeordnet" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sheet-Verbindung</CardTitle>
          <CardSubtitle>
            URL und Spalten-Mapping. AZ-Code muss exakt mit{" "}
            <code className="font-mono text-xs">Product.masterSku</code> übereinstimmen.
          </CardSubtitle>
        </CardHeader>
        <CardBody>
          <InventoryForm initial={initial} />
        </CardBody>
      </Card>

      {source ? (
        <Card>
          <CardHeader>
            <CardTitle>Produktstammdaten aus Sheet</CardTitle>
            <CardSubtitle>
              Aktualisiert <code className="font-mono text-xs">Product.name</code> aus der
              Master-Sheet und legt fehlende AZ-Codes als neue Produkte an. Bestände
              bleiben automatisch zugeordnet.
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <ResyncProductsButton />
          </CardBody>
        </Card>
      ) : null}

      {source ? (
        <Card>
          <CardHeader>
            <CardTitle>Letzter Sync</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row
              label="Zeitpunkt"
              value={
                source.lastSyncedAt ? (
                  <>
                    {formatDateTime(source.lastSyncedAt)}{" "}
                    <span className="text-slate-400">({relativeFromNow(source.lastSyncedAt)})</span>
                  </>
                ) : (
                  <span className="text-slate-400">noch nie</span>
                )
              }
            />
            <Row
              label="Zeilen gelesen"
              value={source.lastRowCount != null ? source.lastRowCount : <span className="text-slate-400">—</span>}
            />
            <Row
              label="Status"
              value={
                source.lastError ? (
                  <Badge variant="danger">Fehler</Badge>
                ) : source.lastSyncedAt ? (
                  <Badge variant="success">OK</Badge>
                ) : (
                  <Badge variant="muted">offen</Badge>
                )
              }
            />
            {source.lastError ? (
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-rose-50 p-3 text-xs text-rose-900">
                {source.lastError}
              </pre>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

async function listSnapshotSkus(orgId: string): Promise<string[]> {
  const rows = await prisma.inventorySnapshot.findMany({
    where: { organizationId: orgId },
    select: { masterSku: true },
  });
  return rows.map((r) => r.masterSku);
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-slate-900">{value}</span>
    </div>
  );
}
