"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type FormState } from "../login/actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, {});
  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
      <div><div className="text-lg font-semibold">Passwort vergessen</div><div className="text-sm text-muted">Wir senden Ihnen einen Link zum Zurücksetzen.</div></div>
      {state.done ? (
        <div className="text-sm text-[color:var(--good)] bg-[color:var(--good-bg)] border border-[color:var(--good)] rounded px-3 py-2">{state.info}</div>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          {state.error ? <div className="text-sm text-bad bg-[color:var(--bad)]/10 border border-bad rounded px-3 py-2">{state.error}</div> : null}
          <label className="flex flex-col gap-1 text-xs text-muted font-semibold">E-Mail
            <input name="email" type="email" required autoComplete="username" className="inp" /></label>
          <button type="submit" className="btn primary" disabled={pending}>{pending ? "Sende…" : "Link senden"}</button>
        </form>
      )}
      <Link href="/login" className="text-xs text-accent hover:underline">← Zurück zum Login</Link>
    </div>
  );
}
