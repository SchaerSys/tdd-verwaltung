"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
      <div>
        <div className="text-lg font-semibold">CareOS Wartung</div>
        <div className="text-sm text-muted">Wartungsplattform · nur Betreiber</div>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <div className="field"><label className="lbl">E-Mail</label><input name="email" type="email" autoComplete="username" className="inp" required autoFocus /></div>
        <div className="field"><label className="lbl">Passwort</label><input name="password" type="password" autoComplete="current-password" className="inp" required /></div>
        {state.error ? <div className="text-sm text-[color:var(--bad)]">{state.error}</div> : null}
        <button className="btn primary" disabled={pending}>{pending ? "Prüfe…" : "Anmelden"}</button>
      </form>
      <p className="text-[.72rem] text-muted">Diese Plattform sieht keine Personendaten – die Datenbankrolle hat dafür kein Leserecht.</p>
    </div>
  );
}
