import { prisma } from "@/lib/db/prisma";
import { getAIClient } from "./client";
import {
  SYSTEM_PROMPT_DE,
  outreachEmailPrompt,
  outreachLinkedInPrompt,
  outreachFollowupPrompt,
  outreachPhonePrompt,
} from "./prompts";
import { toAIInput } from "./productAnalysisService";
import type { OutreachKind } from "@prisma/client";

export type OutreachResult = {
  id: string;
  kind: OutreachKind;
  subject: string | null;
  body: string;
};

export async function generateOutreach(args: {
  leadId: string;
  organizationId: string;
  kind: OutreachKind;
}): Promise<OutreachResult> {
  const lead = await prisma.lead.findFirst({
    where: { id: args.leadId, organizationId: args.organizationId },
    include: { product: true },
  });
  if (!lead) throw new Error("Lead not found");

  const ai = getAIClient();
  const productInput = toAIInput(lead.product);
  const company = {
    name: lead.companyName,
    industry: lead.industry,
    needSignals: lead.needSignals,
    relevanceReason: lead.relevanceReason,
  };

  let subject: string | null = null;
  let body: string;
  let model: string;
  let raw: unknown;

  switch (args.kind) {
    case "EMAIL": {
      const { data, model: m } = await ai.generateJSON<{ subject: string; body: string }>({
        system: SYSTEM_PROMPT_DE,
        prompt: outreachEmailPrompt.build({ product: productInput, company }),
        schemaName: outreachEmailPrompt.schemaName,
        schemaHint: outreachEmailPrompt.schemaHint,
        temperature: 0.5,
      });
      subject = data.subject;
      body = data.body;
      model = m;
      raw = data;
      break;
    }
    case "LINKEDIN": {
      const { data, model: m } = await ai.generateJSON<{ body: string }>({
        system: SYSTEM_PROMPT_DE,
        prompt: outreachLinkedInPrompt.build({ product: productInput, company }),
        schemaName: outreachLinkedInPrompt.schemaName,
        schemaHint: outreachLinkedInPrompt.schemaHint,
        temperature: 0.5,
      });
      body = data.body;
      model = m;
      raw = data;
      break;
    }
    case "FOLLOWUP": {
      const { data, model: m } = await ai.generateJSON<{ subject: string; body: string }>({
        system: SYSTEM_PROMPT_DE,
        prompt: outreachFollowupPrompt.build({ product: productInput, company }),
        schemaName: outreachFollowupPrompt.schemaName,
        schemaHint: outreachFollowupPrompt.schemaHint,
        temperature: 0.4,
      });
      subject = data.subject;
      body = data.body;
      model = m;
      raw = data;
      break;
    }
    case "PHONE_SCRIPT": {
      const { data, model: m } = await ai.generateJSON<{
        opening: string;
        qualifyingQuestions: string[];
        valuePoints: string[];
        nextStep: string;
      }>({
        system: SYSTEM_PROMPT_DE,
        prompt: outreachPhonePrompt.build({ product: productInput, company }),
        schemaName: outreachPhonePrompt.schemaName,
        schemaHint: outreachPhonePrompt.schemaHint,
        temperature: 0.4,
      });
      body = [
        `Eröffnung: ${data.opening}`,
        ``,
        `Qualifying-Fragen:`,
        ...data.qualifyingQuestions.map((q) => `- ${q}`),
        ``,
        `Nutzenargumente:`,
        ...data.valuePoints.map((q) => `- ${q}`),
        ``,
        `Nächster Schritt: ${data.nextStep}`,
      ].join("\n");
      model = m;
      raw = data;
      break;
    }
  }

  const created = await prisma.outreachMessage.create({
    data: {
      organizationId: args.organizationId,
      leadId: lead.id,
      kind: args.kind,
      status: "DRAFT",
      subject,
      body,
      rawJson: raw as unknown as object,
      model,
    },
  });

  await prisma.activity.create({
    data: {
      organizationId: args.organizationId,
      leadId: lead.id,
      kind: "outreach_drafted",
      message: `${args.kind} erstellt`,
      meta: { outreachId: created.id, model } as unknown as object,
    },
  });

  await prisma.usageLog.create({
    data: { organizationId: args.organizationId, kind: "outreach_generation", meta: { kind: args.kind } as unknown as object },
  });

  return { id: created.id, kind: created.kind, subject: created.subject, body: created.body };
}
