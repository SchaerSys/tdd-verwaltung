"use client";
import { useActionState } from "react";
import { einmalPin, type PinState } from "./actions";

/** Personal: Einmal-PIN erzeugen (Anzeige zur Uebergabe, optional per E-Mail). */
export function EinmalPin({ staffId, email, hatPin }: { staffId: string; email: string | null; hatPin: boolean }) {
  const [state, action, pending] = useActionState<PinState, FormData>(einmalPin, {});
  if (state.pin) {
    return (
      <div className="panel p-3 flex flex-col gap-1" style={{ borderColor: "var(--good)" }}>
        <div className="text-[.75rem] text-muted">Einmal-PIN für {state.name} – wird nur jetzt angezeigt{state.gesendet ? " und wurde per E-Mail geschickt" : ""}:</div>
        <div className="mono font-bold" style={{ fontSize: "2rem", letterSpacing: ".3em" }}>{state.pin}</div>
        <div className="text-[.72rem] text-muted">Beim ersten Anmelden am Ausgabelaptop wird sie durch eine eigene PIN ersetzt.</div>
      </div>
    );
  }
  return (
    <form action={action} className="flex gap-3 items-center flex-wrap">
      <input type="hidden" name="staffId" value={staffId} />
      <button className="btn sm" disabled={pending}>{pending ? "…" : hatPin ? "PIN zurücksetzen (neue Einmal-PIN)" : "Einmal-PIN erzeugen"}</button>
      {email ? <label className="flex items-center gap-1 text-[.8rem]"><input type="checkbox" name="mail" defaultChecked /> per E-Mail an {email}</label> : <span className="text-[.75rem] text-muted">keine E-Mail hinterlegt – PIN persönlich übergeben</span>}
      {state.error ? <span className="text-xs" style={{ color: "var(--bad)" }}>{state.error}</span> : null}
    </form>
  );
}
