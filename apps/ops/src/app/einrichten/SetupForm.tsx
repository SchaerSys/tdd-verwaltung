"use client";
import { useActionState } from "react";
import { ersteEinrichtung, type SetupState } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState<SetupState, FormData>(ersteEinrichtung, {});
  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
      <div>
        <div className="text-lg font-semibold">Tafelwerk Wartung einrichten</div>
        <div className="text-sm text-muted">Erstes Betreiber-Konto – diese Seite gibt es nur einmal.</div>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <div className="field"><label className="lbl">E-Mail</label><input name="email" type="email" autoComplete="username" className="inp" required autoFocus /></div>
        <div className="field"><label className="lbl">Anzeigename</label><input name="displayName" className="inp" required /></div>
        <div className="field"><label className="lbl">Passwort (min. 12 Zeichen)</label><input name="password" type="password" autoComplete="new-password" className="inp" minLength={12} required /></div>
        <div className="field"><label className="lbl">Passwort wiederholen</label><input name="confirm" type="password" autoComplete="new-password" className="inp" minLength={12} required /></div>
        {state.error ? <div className="text-sm text-[color:var(--bad)]">{state.error}</div> : null}
        <button className="btn primary" disabled={pending}>{pending ? "Lege an…" : "Konto anlegen"}</button>
      </form>
      <p className="text-[.72rem] text-muted">Danach anmelden und unter „Mein Konto“ den zweiten Faktor einrichten.</p>
    </div>
  );
}
