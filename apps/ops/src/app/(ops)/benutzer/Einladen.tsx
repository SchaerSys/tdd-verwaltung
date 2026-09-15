"use client";
import { useActionState } from "react";
import { einladen, passwortLink, type BenutzerState } from "./actions";

interface Opt { id: number; name: string; type?: string }

export function Einladen({ standorte, organisationen, vorgabeOrg, vorgabeRolle }: { standorte: Opt[]; organisationen: Opt[]; vorgabeOrg?: number; vorgabeRolle?: string }) {
  const [state, action, pending] = useActionState<BenutzerState, FormData>(einladen, {});
  return (
    <form action={action} className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="field"><label className="lbl">E-Mail *</label><input name="email" type="email" className="inp" required /></div>
      <div className="field"><label className="lbl">Anzeigename *</label><input name="displayName" className="inp" required /></div>
      <div className="field"><label className="lbl">Rolle</label>
        <select name="role" className="inp" defaultValue={vorgabeRolle ?? "ERFASSUNG"}>
          <option value="ADMIN">ADMIN – Büro, alles</option><option value="ERFASSUNG">ERFASSUNG – Personen/Karten</option>
          <option value="AUSGABE">AUSGABE – Tresen/Kiosk</option><option value="AUSWERTUNG">AUSWERTUNG – nur Berichte</option>
          <option value="SACHBEARBEITER">SACHBEARBEITER – Portal Gemeinde/Institution</option><option value="FAHRER">FAHRER – Tour am Handy</option>
        </select></div>
      <div className="field"><label className="lbl">Standort (TDD-Rollen)</label>
        <select name="locationId" className="inp"><option value="">—</option>{standorte.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="field"><label className="lbl">Organisation (Sachbearbeiter)</label>
        <select name="organizationId" className="inp" defaultValue={vorgabeOrg ? String(vorgabeOrg) : ""}><option value="">—</option>{organisationen.map((o) => <option key={o.id} value={o.id}>{o.type === "GEMEINDE" ? "Gemeinde" : o.type === "INSTITUTION" ? "Institution" : "TDD"} · {o.name}</option>)}</select></div>
      <div className="field justify-end"><button className="btn primary" disabled={pending}>{pending ? "Lege an…" : "Einladen"}</button></div>
      {state.error ? <div className="sm:col-span-3 text-sm text-[color:var(--bad)]">{state.error}</div> : null}
      {state.info ? <div className="sm:col-span-3 text-sm text-[color:var(--good)]">{state.info}{state.link ? <> <code className="mono text-xs break-all">{state.link}</code></> : null}</div> : null}
      <div className="sm:col-span-3 text-[.72rem] text-muted">Es wird kein Passwort vergeben – die Person setzt es selbst über den Link (72 h gültig). Mindestlänge 10 Zeichen, 2FA optional im Konto.</div>
    </form>
  );
}

export function PasswortLink({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<BenutzerState, FormData>(passwortLink, {});
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="userId" value={userId} />
      <button className="btn ghost sm" disabled={pending} title="Neuen Passwort-Link per Mail schicken">Passwort-Link</button>
      {state.error ? <span className="text-xs text-[color:var(--bad)]">{state.error}</span> : null}
      {state.info ? <span className="text-xs text-[color:var(--good)]">{state.info}{state.link ? <code className="mono break-all"> {state.link}</code> : null}</span> : null}
    </form>
  );
}
