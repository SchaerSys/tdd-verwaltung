"use client";
import { useActionState } from "react";
import { pinAendern, type StationState } from "../actions";

export function PinForm({ staffId, name }: { staffId: string; name: string }) {
  const [state, action, pending] = useActionState<StationState, FormData>(pinAendern, {});
  if (state.ok) {
    return (
      <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4 mx-auto text-center">
        <div className="text-lg font-semibold">PIN gespeichert</div>
        <div className="text-sm text-muted">{name}, ab jetzt meldest du dich mit deiner eigenen PIN an.</div>
        <a href="/ausgabe" className="btn primary" style={{ padding: 14 }}>Zur Ausgabe</a>
      </div>
    );
  }
  return (
    <form action={action} className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-3 mx-auto">
      <input type="hidden" name="staffId" value={staffId} />
      <div><div className="text-lg font-semibold">Eigene PIN festlegen</div><div className="text-sm text-muted">{name} – die Einmal-PIN vom Büro gilt nur für diesen Schritt.</div></div>
      <label className="lbl">Einmal-PIN</label>
      <input name="alt" type="password" inputMode="numeric" className="inp text-center mono" style={{ fontSize: "1.5rem", letterSpacing: ".3em" }} maxLength={8} required autoFocus />
      <label className="lbl">Neue PIN (4–8 Ziffern)</label>
      <input name="neu" type="password" inputMode="numeric" className="inp text-center mono" style={{ fontSize: "1.5rem", letterSpacing: ".3em" }} maxLength={8} required />
      <label className="lbl">Neue PIN wiederholen</label>
      <input name="neu2" type="password" inputMode="numeric" className="inp text-center mono" style={{ fontSize: "1.5rem", letterSpacing: ".3em" }} maxLength={8} required />
      {state.error ? <div className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</div> : null}
      <button className="btn primary" disabled={pending} style={{ padding: 14 }}>{pending ? "Speichere…" : "PIN speichern"}</button>
      <a href="/ausgabe" className="text-[.75rem] text-muted text-center">Abbrechen</a>
    </form>
  );
}
