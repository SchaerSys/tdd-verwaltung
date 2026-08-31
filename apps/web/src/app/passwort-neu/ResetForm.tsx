"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPassword, type FormState } from "../login/actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
      <div><div className="text-lg font-semibold">Neues Passwort</div><div className="text-sm text-muted">Bitte vergeben Sie ein neues Passwort.</div></div>
      {!token ? (
        <div className="text-sm text-bad">Kein gültiger Link.</div>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          {state.error ? <div className="text-sm text-bad bg-[color:var(--bad)]/10 border border-bad rounded px-3 py-2">{state.error}</div> : null}
          <label className="flex flex-col gap-1 text-xs text-muted font-semibold">Neues Passwort (mind. 8 Zeichen)
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className="inp" /></label>
          <button type="submit" className="btn primary" disabled={pending}>{pending ? "Speichere…" : "Passwort setzen"}</button>
        </form>
      )}
      <Link href="/login" className="text-xs text-accent hover:underline">← Zurück zum Login</Link>
    </div>
  );
}
