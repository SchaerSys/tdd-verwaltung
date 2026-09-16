"use client";
import { useActionState } from "react";
import { createUser, type UserState } from "../actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

interface Rolle { value: string; label: string; desc: string }
interface Ort { id: number; name: string }

/** Benutzer anlegen mit Rueckmeldung – vorher verschwand ein Fehler (z. B. E-Mail schon vergeben) stumm. */
export function NeuerBenutzer({ rollen, orte }: { rollen: Rolle[]; orte: Ort[] }) {
  const [state, action, pending] = useActionState<UserState, FormData>(createUser, {});
  return (
    <form action={action} className="p-4 border-b border-[color:var(--border)]" key={state.ok ? String(state.angelegt) : "form"}>
      <div className="lbl mb-2">Neuen Benutzer anlegen</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input name="displayName" className="inp" placeholder="Name" required />
        <input name="email" type="email" className="inp" placeholder="E-Mail" required />
        <input name="password" type="text" className="inp mono" placeholder={`Passwort (min. ${MIN_PASSWORD_LENGTH})`} minLength={MIN_PASSWORD_LENGTH} required />
        <select name="role" className="inp" defaultValue="AUSGABE">
          {rollen.map((r) => <option key={r.value} value={r.value}>{r.label} – {r.desc}</option>)}
        </select>
        <select name="locationId" className="inp" defaultValue="">
          <option value="">— Standort (optional) —</option>
          {orte.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button type="submit" className="btn primary" disabled={pending}>{pending ? "Lege an…" : "Anlegen"}</button>
      </div>
      {state.error ? <div className="text-sm mt-2" style={{ color: "var(--bad)" }}>{state.error}</div> : null}
      {state.ok ? <div className="text-sm mt-2" style={{ color: "var(--good)" }}>✓ {state.angelegt} angelegt. Fahrer:innen danach im Personal-Datensatz unter „Fahrdienst“ mit der Person verknüpfen.</div> : null}
      <div className="sub mt-1">Zivildiener → Rolle „Kasse": sehen ausschließlich den Tresen-Kiosk, keine weiteren Daten. Fahrer:innen sehen nur ihre Tour am Handy.</div>
    </form>
  );
}
