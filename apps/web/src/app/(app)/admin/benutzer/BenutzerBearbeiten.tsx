"use client";
import { useActionState, useState } from "react";
import { updateUser, type UserState } from "../actions";

interface Rolle { value: string; label: string; desc: string }
interface Ort { id: number; name: string }
export interface BenutzerZeile { id: string; displayName: string; email: string; username: string | null; role: string; locationId: number | null; isActive: boolean }

/** Inline-Bearbeitung eines Benutzers: Name, E-Mail, Rolle, Standort, optional neues Passwort. */
export function BenutzerBearbeiten({ u, rollen, orte, selbst }: { u: BenutzerZeile; rollen: Rolle[]; orte: Ort[]; selbst: boolean }) {
  const [offen, setOffen] = useState(false);
  const [state, action, pending] = useActionState<UserState, FormData>(updateUser, {});
  if (!offen) {
    return <button type="button" className="btn ghost sm" onClick={() => setOffen(true)}>Bearbeiten</button>;
  }
  return (
    <form action={action} className="panel p-3 flex flex-col gap-2" style={{ minWidth: 320 }}>
      <input type="hidden" name="userId" value={u.id} />
      <div className="field"><label className="lbl">Name</label><input name="displayName" className="inp" defaultValue={u.displayName} required /></div>
      <div className="field"><label className="lbl">E-Mail</label><input name="email" type="email" className="inp" defaultValue={u.email} required /></div>
      <div className="field"><label className="lbl">Benutzername (Login, z. B. vorname.nachname)</label><input name="username" className="inp mono" defaultValue={u.username ?? ""} placeholder="leer = automatisch aus dem Namen" /></div>
      {u.role === "SACHBEARBEITER" ? <input type="hidden" name="role" value={u.role} /> : (
        <div className="field"><label className="lbl">Rolle</label>
          <select name="role" className="inp" defaultValue={u.role} disabled={selbst}>{rollen.map((r) => <option key={r.value} value={r.value}>{r.label} – {r.desc}</option>)}</select>
          {selbst ? <><input type="hidden" name="role" value={u.role} /><div className="text-[.72rem] text-muted">Die eigene Rolle lässt sich nicht ändern.</div></> : null}
        </div>
      )}
      <div className="field"><label className="lbl">Standort</label>
        <select name="locationId" className="inp" defaultValue={u.locationId ?? ""}><option value="">—</option>{orte.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      <label className="flex items-center gap-2 text-[.8125rem]"><input type="checkbox" name="initialpasswort" /> Neues Initialpasswort per E-Mail senden (Passwort vergessen) – Wechsel beim nächsten Login Pflicht</label>
      {state.error ? <div className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</div> : null}
      {state.ok ? <div className="text-sm" style={{ color: "var(--good)" }}>✓ gespeichert{state.angelegt ? ` – ${state.angelegt}` : ""}{state.initialpasswort ? <code className="mono ml-2 select-all">{state.initialpasswort}</code> : null}</div> : null}
      <div className="flex gap-2">
        <button className="btn primary sm" type="submit" disabled={pending}>{pending ? "Speichere…" : "Speichern"}</button>
        <button className="btn ghost sm" type="button" onClick={() => setOffen(false)}>Schließen</button>
      </div>
    </form>
  );
}
