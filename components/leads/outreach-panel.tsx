"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateOutreachAction, setOutreachStatusAction } from "@/lib/leads/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OutreachKind, OutreachMessage, OutreachStatus } from "@prisma/client";

const KINDS: Array<{ kind: OutreachKind; label: string; hint: string }> = [
  { kind: "EMAIL", label: "E-Mail", hint: "Erstanschreiben" },
  { kind: "LINKEDIN", label: "LinkedIn", hint: "Kurznachricht" },
  { kind: "FOLLOWUP", label: "Follow-Up", hint: "Erinnerung" },
  { kind: "PHONE_SCRIPT", label: "Telefon", hint: "Gesprächsleitfaden" },
];

export function OutreachPanel({
  leadId,
  messages,
}: {
  leadId: string;
  messages: OutreachMessage[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function generate(kind: OutreachKind) {
    start(async () => {
      await generateOutreachAction({ leadId, kind });
      router.refresh();
    });
  }

  function setStatus(outreachId: string, status: OutreachStatus) {
    start(async () => {
      await setOutreachStatusAction({ outreachId, status });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Button
            key={k.kind}
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => generate(k.kind)}
            title={k.hint}
          >
            {pending ? "…" : `${k.label} generieren`}
          </Button>
        ))}
      </div>

      {messages.length === 0 ? (
        <p className="text-sm text-slate-500">
          Noch keine Outreach-Nachricht — generiere eine Variante. Ausgang erfolgt manuell, niemals automatisch.
        </p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="info">{m.kind.toLowerCase()}</Badge>
                  <Badge
                    variant={
                      m.status === "SENT" ? "success" : m.status === "APPROVED" ? "info" : "muted"
                    }
                  >
                    {m.status.toLowerCase()}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {m.status !== "APPROVED" ? (
                    <Button size="sm" variant="secondary" onClick={() => setStatus(m.id, "APPROVED")}>
                      Freigeben
                    </Button>
                  ) : null}
                  {m.status === "APPROVED" ? (
                    <Button size="sm" onClick={() => setStatus(m.id, "SENT")}>
                      Als gesendet markieren
                    </Button>
                  ) : null}
                </div>
              </div>
              {m.subject ? <div className="mb-1 text-sm font-semibold text-slate-900">{m.subject}</div> : null}
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{m.body}</pre>
              <div className="mt-2 text-xs text-slate-400">Modell: {m.model ?? "—"}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
