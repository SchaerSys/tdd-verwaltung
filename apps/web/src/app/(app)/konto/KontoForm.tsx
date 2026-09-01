"use client";

import { useActionState } from "react";
import { changePassword, type PwState } from "./actions";

const initial: PwState = { ok: false };

export function KontoForm() {
  const [state, action, pending] = useActionState(changePassword, initial);

  return (
    <form action={action} className="grid gap-3" style={{ maxWidth: 380 }}>
      {state.ok ? (
        <div className="pill good" style={{ alignSelf: "start" }}><span className="dot" />Passwort geändert.</div>
      ) : null}
      {state.error ? (
        <div className="text-[.85rem]" style={{ color: "var(--bad, #c0392b)" }}>{state.error}</div>
      ) : null}

      <label className="grid gap-1">
        <span className="lbl">Aktuelles Passwort</span>
        <input name="current" type="password" className="inp" autoComplete="current-password" required />
      </label>
      <label className="grid gap-1">
        <span className="lbl">Neues Passwort (min. 10 Zeichen)</span>
        <input name="next" type="password" className="inp" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="grid gap-1">
        <span className="lbl">Neues Passwort wiederholen</span>
        <input name="confirm" type="password" className="inp" autoComplete="new-password" minLength={10} required />
      </label>

      <button type="submit" className="btn primary" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Wird geändert…" : "Passwort ändern"}
      </button>
    </form>
  );
}
