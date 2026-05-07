import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { toCsv } from "@/lib/utils/csv";
import type { LeadStatus, Prisma } from "@prisma/client";

const STATUSES = new Set<LeadStatus>([
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

export async function GET(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? undefined;
  const productId = searchParams.get("productId") ?? undefined;
  const statusRaw = searchParams.get("status") ?? undefined;
  const status = statusRaw && STATUSES.has(statusRaw as LeadStatus) ? (statusRaw as LeadStatus) : undefined;
  const minScoreStr = searchParams.get("minScore");
  const minScore = minScoreStr ? parseInt(minScoreStr, 10) : undefined;
  const hasContact = searchParams.get("hasContact") ?? undefined;

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

  const leads = await prisma.lead.findMany({
    where,
    orderBy: [{ score: "desc" }, { companyName: "asc" }],
    take: 5000,
    include: {
      product: { select: { name: true } },
      sources: { select: { url: true } },
    },
  });

  const rows = leads.map((l) => ({
    company: l.companyName,
    website: l.website ?? "",
    industry: l.industry ?? "",
    city: l.city ?? "",
    country: l.country ?? "",
    contact_email: l.contactEmail ?? "",
    contact_phone: l.contactPhone ?? "",
    contact_person: l.contactPerson ?? "",
    contact_role: l.contactRole ?? "",
    imprint_url: l.imprintUrl ?? "",
    score: l.score,
    status: l.status,
    data_quality: l.dataQuality,
    relevance: l.relevanceReason ?? "",
    need_signals: l.needSignals,
    products_found: l.productsFound,
    sources: l.sources.map((s) => s.url),
    product: l.product.name,
    created_at: l.createdAt.toISOString(),
  }));

  const csv = toCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${stamp}.csv"`,
    },
  });
}
