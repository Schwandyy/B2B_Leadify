"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { generateOutreach } from "@/lib/ai/outreachService";
import type { LeadStatus, OutreachKind, OutreachStatus } from "@prisma/client";

const STATUS = [
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
] as const;

export async function setLeadStatusAction(input: { leadId: string; status: LeadStatus }) {
  const user = await requireUser();
  const parsed = z.object({ leadId: z.string().min(1), status: z.enum(STATUS) }).parse(input);
  const lead = await prisma.lead.findFirst({
    where: { id: parsed.leadId, organizationId: user.organizationId },
    select: { id: true, status: true },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.status === parsed.status) return;
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: parsed.status },
  });
  await prisma.activity.create({
    data: {
      organizationId: user.organizationId,
      leadId: lead.id,
      userId: user.id,
      kind: "status_change",
      message: `Status: ${lead.status} → ${parsed.status}`,
    },
  });
  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function addNoteAction(input: { leadId: string; body: string }) {
  const user = await requireUser();
  const parsed = z.object({ leadId: z.string().min(1), body: z.string().min(1).max(4000) }).parse(input);
  const lead = await prisma.lead.findFirst({
    where: { id: parsed.leadId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!lead) throw new Error("Lead not found");
  await prisma.note.create({
    data: {
      organizationId: user.organizationId,
      leadId: lead.id,
      authorId: user.id,
      body: parsed.body,
    },
  });
  await prisma.activity.create({
    data: {
      organizationId: user.organizationId,
      leadId: lead.id,
      userId: user.id,
      kind: "note",
      message: parsed.body.slice(0, 200),
    },
  });
  revalidatePath(`/leads/${lead.id}`);
}

export async function generateOutreachAction(input: { leadId: string; kind: OutreachKind }) {
  const user = await requireUser();
  const result = await generateOutreach({
    leadId: input.leadId,
    organizationId: user.organizationId,
    kind: input.kind,
  });
  revalidatePath(`/leads/${input.leadId}`);
  return result;
}

export async function setOutreachStatusAction(input: { outreachId: string; status: OutreachStatus }) {
  const user = await requireUser();
  const parsed = z
    .object({ outreachId: z.string().min(1), status: z.enum(["DRAFT", "APPROVED", "SENT"]) })
    .parse(input);
  const message = await prisma.outreachMessage.findFirst({
    where: { id: parsed.outreachId, organizationId: user.organizationId },
    select: { id: true, leadId: true },
  });
  if (!message) throw new Error("Outreach not found");
  await prisma.outreachMessage.update({
    where: { id: message.id },
    data: { status: parsed.status },
  });
  await prisma.activity.create({
    data: {
      organizationId: user.organizationId,
      leadId: message.leadId,
      userId: user.id,
      kind: "outreach_status",
      message: `Outreach → ${parsed.status}`,
      meta: { outreachId: message.id } as unknown as object,
    },
  });
  revalidatePath(`/leads/${message.leadId}`);
}
