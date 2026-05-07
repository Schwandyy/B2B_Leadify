"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { analyzeProduct } from "@/lib/ai/productAnalysisService";
import { runResearch } from "@/lib/research/researchService";
import type { TargetCustomerType } from "@prisma/client";

const TARGET_TYPES = [
  "RESELLER",
  "MANUFACTURER",
  "ENTERPRISE",
  "DISTRIBUTOR",
  "RETAILER",
  "EDUCATION",
  "PUBLIC_SECTOR",
  "SERVICE_PROVIDER",
  "AGENCY",
  "PARTNER",
] as const;

const productSchema = z.object({
  name: z.string().min(2).max(180),
  description: z.string().min(10).max(8000),
  productUrl: z.string().url().optional().or(z.literal("")),
  category: z.string().max(80).optional().or(z.literal("")),
  targetRegion: z.string().max(40).optional().or(z.literal("")),
  targetCustomerTypes: z.array(z.enum(TARGET_TYPES)).default([]),
  keywords: z.array(z.string().min(1).max(60)).default([]),
  exclusions: z.array(z.string().min(1).max(60)).default([]),
  priceRangeMin: z.coerce.number().int().nonnegative().optional(),
  priceRangeMax: z.coerce.number().int().nonnegative().optional(),
  currency: z.string().min(3).max(3).default("EUR"),
});

export type ProductActionResult = { ok: true; productId: string } | { ok: false; error: string };

function splitTags(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,\n;]/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);
const MAX_BYTES = 6 * 1024 * 1024;

async function persistAttachment(file: File): Promise<{ relPath: string; mime: string }> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Dateityp nicht erlaubt: ${file.type}`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Datei zu groß (max. 6 MB).");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || "";
  const safeName = `${randomBytes(8).toString("hex")}${ext}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dir = process.env.UPLOAD_DIR || "public/uploads";
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, safeName);
  await writeFile(fullPath, buf);
  // expose via /uploads/...
  return { relPath: `/uploads/${safeName}`, mime: file.type };
}

export async function createProductAction(
  _prev: ProductActionResult | null,
  formData: FormData,
): Promise<ProductActionResult> {
  const user = await requireUser();

  const targetCustomerTypes = formData.getAll("targetCustomerTypes").map((v) => String(v));
  const keywords = splitTags(formData.get("keywords"));
  const exclusions = splitTags(formData.get("exclusions"));

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    productUrl: formData.get("productUrl") ?? "",
    category: formData.get("category") ?? "",
    targetRegion: formData.get("targetRegion") ?? "",
    targetCustomerTypes,
    keywords,
    exclusions,
    priceRangeMin: formData.get("priceRangeMin") || undefined,
    priceRangeMax: formData.get("priceRangeMax") || undefined,
    currency: formData.get("currency") || "EUR",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Eingaben prüfen" };
  }

  let attachmentPath: string | undefined;
  let attachmentMime: string | undefined;
  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    try {
      const { relPath, mime } = await persistAttachment(file);
      attachmentPath = relPath;
      attachmentMime = mime;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload fehlgeschlagen";
      return { ok: false, error: message };
    }
  }

  const v = parsed.data;
  const product = await prisma.product.create({
    data: {
      organizationId: user.organizationId,
      ownerId: user.id,
      name: v.name,
      description: v.description,
      productUrl: v.productUrl || null,
      category: v.category || null,
      targetRegion: v.targetRegion || null,
      targetCustomerTypes: v.targetCustomerTypes as unknown as TargetCustomerType[],
      keywords: v.keywords,
      exclusions: v.exclusions,
      priceRangeMin: v.priceRangeMin ?? null,
      priceRangeMax: v.priceRangeMax ?? null,
      currency: v.currency,
      attachmentPath,
      attachmentMime,
    },
  });

  revalidatePath("/products");
  redirect(`/products/${product.id}`);
}

export async function analyzeProductAction(productId: string) {
  const user = await requireUser();
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!product) throw new Error("Product not found");
  await analyzeProduct(product.id);
  revalidatePath(`/products/${productId}`);
}

export async function startSearchAction(productId: string) {
  const user = await requireUser();
  const result = await runResearch({
    productId,
    organizationId: user.organizationId,
    triggeredById: user.id,
  });
  revalidatePath(`/products/${productId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return result;
}
