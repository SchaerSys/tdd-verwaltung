"use client";

import { useActionState } from "react";
import Link from "next/link";
import { confirmAccount, type FormState } from "../login/actions";

export function ConfirmForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmAccount, {});
  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
      <div><div className="text-lg font-semibold">Konto bestätigen</div><div className="text-sm text-muted">Klicken Sie zum Aktivieren Ihres Zugangs.</div></div>
      {!token ? <div className="text-sm text-bad">Kein gültiger Link.</div> : (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          {state.error ? <div className="text-sm text-bad bg-[color:var(--bad)]/10 border border-bad rounded px-3 py-2">{state.error}</div> : null}
          <button type="submit" className="btn primary" disabled={pending}>{pending ? "Bestätige…" : "Konto bestätigen"}</button>
        </form>
      )}
      <Link href="/login" className="text-xs text-accent hover:underline">← Zum Login</Link>
    </div>
  );
}
