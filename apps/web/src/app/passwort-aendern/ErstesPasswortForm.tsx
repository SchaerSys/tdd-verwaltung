"use client";
import { useActionState } from "react";
import { erstesPasswortSetzen, type PwState } from "./actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

export function ErstesPasswortForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<PwState, FormData>(erstesPasswortSetzen, {});
  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
      <div><div className="text-lg font-semibold">Willkommen, {name}</div><div className="text-sm text-muted">Bitte zuerst ein eigenes Passwort festlegen. Das Initialpasswort aus der E-Mail gilt danach nicht mehr.</div></div>
      <form action={action} className="flex flex-col gap-3">
        <div className="field"><label className="lbl">Initialpasswort (aus der E-Mail)</label><input name="current" type="password" autoComplete="current-password" className="inp" required /></div>
        <div className="field"><label className="lbl">Neues Passwort (min. {MIN_PASSWORD_LENGTH} Zeichen)</label><input name="next" type="password" autoComplete="new-password" className="inp" minLength={MIN_PASSWORD_LENGTH} required /></div>
        <div className="field"><label className="lbl">Neues Passwort wiederholen</label><input name="confirm" type="password" autoComplete="new-password" className="inp" minLength={MIN_PASSWORD_LENGTH} required /></div>
        {state.error ? <div className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</div> : null}
        <button className="btn primary" disabled={pending}>{pending ? "Speichere…" : "Passwort festlegen und weiter"}</button>
      </form>
    </div>
  );
}
