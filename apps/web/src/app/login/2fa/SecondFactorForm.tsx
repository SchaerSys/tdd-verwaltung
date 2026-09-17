"use client";
import { useActionState } from "react";
import Link from "next/link";
import { secondFactorAction, type LoginState } from "../actions";

export function SecondFactorForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(secondFactorAction, {});
  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
      <div>
        <div className="text-lg font-semibold">Tafelwerk</div>
        <div className="text-sm text-muted">Zweiter Schritt der Anmeldung</div>
      </div>
      <p className="text-sm">
        Geben Sie den sechsstelligen Code aus Ihrer Authenticator-App ein. Falls Sie keinen
        Zugriff darauf haben, gilt auch einer Ihrer Wiederherstellungscodes.
      </p>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="code" autoFocus autoComplete="one-time-code" inputMode="numeric"
          className="inp text-center text-xl tracking-[0.3em]" placeholder="000000" maxLength={11} required
        />
        {state.error ? <div className="text-sm text-[color:var(--bad)]">{state.error}</div> : null}
        <button className="btn primary" disabled={pending}>{pending ? "Prüfe…" : "Anmelden"}</button>
      </form>
      <Link href="/login" className="text-xs text-accent hover:underline">← Zurück zur Anmeldung</Link>
    </div>
  );
}
