"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLeadStatusAction } from "@/lib/leads/actions";
import { Select } from "@/components/ui/input";
import type { LeadStatus } from "@prisma/client";

const OPTIONS: LeadStatus[] = [
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
];

export function StatusControl({ leadId, current }: { leadId: string; current: LeadStatus }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Select
      defaultValue={current}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          await setLeadStatusAction({ leadId, status: e.target.value as LeadStatus });
          router.refresh();
        })
      }
      className="max-w-xs"
    >
      {OPTIONS.map((s) => (
        <option key={s} value={s}>
          {s.toLowerCase()}
        </option>
      ))}
    </Select>
  );
}
