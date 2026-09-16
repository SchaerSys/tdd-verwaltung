"use client";
import { useActionState } from "react";
import { tabletCode, type KoppelState } from "../actions";

/** Disposition: Code erzeugen, den das Tablet im Fahrzeug unter /fahrzeug eingibt. */
export function TabletKoppeln({ fahrzeugId, vorschlag }: { fahrzeugId: number; vorschlag: string }) {
  const [state, action, pending] = useActionState<KoppelState, FormData>(tabletCode, {});
  if (state.code) {
    return (
      <div className="panel p-3 flex flex-col gap-1" style={{ borderColor: "var(--good)" }}>
        <div className="text-[.75rem] text-muted">Am Tablet <b className="mono">tdd.schaer-systems.at/fahrzeug</b> öffnen und eingeben (10 Minuten gültig):</div>
        <div className="mono font-bold" style={{ fontSize: "2rem", letterSpacing: ".25em" }}>{state.code}</div>
        <div className="text-[.72rem] text-muted">Gerät: {state.name}. Danach die Seite am Tablet „Zum Startbildschirm hinzufügen“.</div>
      </div>
    );
  }
  return (
    <form action={action} className="flex gap-2 items-end flex-wrap">
      <input type="hidden" name="fahrzeugId" value={fahrzeugId} />
      <div className="field"><label className="lbl">Gerätename</label><input name="name" className="inp sm" defaultValue={vorschlag} style={{ width: 200 }} /></div>
      <button className="btn sm" disabled={pending}>{pending ? "…" : "📲 Tablet koppeln"}</button>
      {state.error ? <span className="text-xs" style={{ color: "var(--bad)" }}>{state.error}</span> : null}
    </form>
  );
}
