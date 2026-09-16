"use client";
import { useActionState } from "react";
import { stationCode, type StationCodeState } from "./actions";

export function StationCode() {
  const [state, action, pending] = useActionState<StationCodeState, FormData>(stationCode, {});
  if (state.code) {
    return (
      <div className="panel p-3 flex flex-col gap-1" style={{ borderColor: "var(--good)" }}>
        <div className="text-[.75rem] text-muted">Am Laptop <b className="mono">tdd.schaer-systems.at/ausgabe</b> öffnen und eingeben (10 Minuten gültig):</div>
        <div className="mono font-bold" style={{ fontSize: "2rem", letterSpacing: ".25em" }}>{state.code}</div>
        <div className="text-[.72rem] text-muted">Gerät: {state.name}. Danach Chrome/Edge „App installieren“ und Verknüpfung mit <span className="mono">--kiosk-printing</span> anlegen (siehe Anleitung).</div>
      </div>
    );
  }
  return (
    <form action={action} className="flex gap-2 items-end flex-wrap">
      <div className="field"><label className="lbl">Gerätename</label><input name="name" className="inp sm" defaultValue="Ausgabelaptop" style={{ width: 220 }} /></div>
      <button className="btn sm" disabled={pending}>{pending ? "…" : "💻 Laptop koppeln"}</button>
      {state.error ? <span className="text-xs" style={{ color: "var(--bad)" }}>{state.error}</span> : null}
    </form>
  );
}
