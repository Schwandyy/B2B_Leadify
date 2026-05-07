"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type ActionResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(loginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">Passwort</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
      </div>
      {state && !state.ok ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Anmelden …" : "Anmelden"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Noch kein Account?{" "}
        <Link href="/register" className="font-medium text-slate-900 underline">
          Registrieren
        </Link>
      </p>
    </form>
  );
}
