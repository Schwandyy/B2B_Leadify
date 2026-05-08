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
});

export type ActionResult = { ok: true } | { ok: false; error: string };

// Nur Email-Adressen mit dieser Domain dürfen sich registrieren.
// Override per env REGISTER_ALLOWED_DOMAIN möglich (z. B. für Tests).
const ALLOWED_DOMAIN = (process.env.REGISTER_ALLOWED_DOMAIN ?? "az-delivery.com").toLowerCase();
const FALLBACK_ORG_NAME = "AZ-Delivery";
const FALLBACK_ORG_SLUG = "az-delivery";

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
  });
  if (!parsed.success) {
    return { ok: false, error: "Bitte alle Felder korrekt ausfüllen (Passwort ≥ 8 Zeichen)." };
  }
  const { email, password, name } = parsed.data;
  const lowerEmail = email.toLowerCase();

  // Domain-Restriction: nur Mitglieder mit @az-delivery.com-Adresse.
  if (!lowerEmail.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return {
      ok: false,
      error: `Registrierung nur mit einer @${ALLOWED_DOMAIN}-Adresse möglich.`,
    };
  }

  const existing = await prisma.user.findUnique({ where: { email: lowerEmail } });
  if (existing) return { ok: false, error: "Diese E-Mail ist bereits registriert." };

  // Single-Tenant: alle AZ-Mitarbeiter landen in derselben Organisation.
  // Wenn schon eine existiert, wird die genutzt; sonst wird eine angelegt.
  // Erster User wird ADMIN, alle weiteren MEMBER (ein Admin kann später
  // promoten).
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    let org = await tx.organization.findFirst({ orderBy: { createdAt: "asc" } });
    let isFirstInOrg = false;
    if (!org) {
      org = await tx.organization.create({
        data: {
          name: FALLBACK_ORG_NAME,
          slug: FALLBACK_ORG_SLUG,
          subscription: { create: { tier: "free" } },
        },
      });
      isFirstInOrg = true;
    } else {
      const userCount = await tx.user.count({ where: { organizationId: org.id } });
      isFirstInOrg = userCount === 0;
    }
    return tx.user.create({
      data: {
        email: lowerEmail,
        passwordHash,
        name,
        role: isFirstInOrg ? "ADMIN" : "MEMBER",
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
