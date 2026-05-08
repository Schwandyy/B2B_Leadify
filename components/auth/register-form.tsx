"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type ActionResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(registerAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="name">Dein Name</Label>
        <Input id="name" name="name" type="text" autoComplete="name" required />
      </div>
      <div>
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="vorname.nachname@az-delivery.com"
          pattern=".+@az-delivery\.com"
          title="Nur Adressen mit @az-delivery.com sind erlaubt."
        />
        <FieldHint>
          Nur Adressen mit <code>@az-delivery.com</code>.
        </FieldHint>
      </div>
      <div>
        <Label htmlFor="password">Passwort</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <FieldHint>Mindestens 8 Zeichen.</FieldHint>
      </div>
      {state && !state.ok ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Konto wird erstellt …" : "Account erstellen"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Bereits registriert?{" "}
        <Link href="/login" className="font-medium text-slate-900 underline">
          Anmelden
        </Link>
      </p>
    </form>
  );
}
