"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession } from "./session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  organizationName: z.string().min(2).max(120),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Bitte E-Mail und Passwort prüfen." };
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return { ok: false, error: "Ungültige Zugangsdaten." };
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { ok: false, error: "Ungültige Zugangsdaten." };
  await createSession({ uid: user.id, oid: user.organizationId, role: user.role });
  redirect("/dashboard");
}

export async function registerAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
    organizationName: formData.get("organizationName"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Bitte alle Felder korrekt ausfüllen (Passwort ≥ 8 Zeichen)." };
  }
  const { email, password, name, organizationName } = parsed.data;
  const lowerEmail = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: lowerEmail } });
  if (existing) return { ok: false, error: "Diese E-Mail ist bereits registriert." };

  const baseSlug = slugify(organizationName) || "org";
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    const taken = await prisma.organization.findUnique({ where: { slug } });
    if (!taken) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: organizationName,
        slug,
        subscription: { create: { tier: "free" } },
      },
    });
    return tx.user.create({
      data: {
        email: lowerEmail,
        passwordHash,
        name,
        role: "ADMIN", // first user of an org is admin
        organizationId: org.id,
      },
    });
  });

  await createSession({ uid: user.id, oid: user.organizationId, role: user.role });
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
