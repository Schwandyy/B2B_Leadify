"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { addNoteAction } from "@/lib/leads/actions";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function NoteForm({ leadId }: { leadId: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        start(async () => {
          await addNoteAction({ leadId, body });
          setBody("");
          router.refresh();
        });
      }}
      className="space-y-2"
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Notiz hinzufügen — z. B. Recherche-Erkenntnis, nächster Schritt …"
        rows={3}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {pending ? "Speichere …" : "Notiz speichern"}
        </Button>
      </div>
    </form>
  );
}
