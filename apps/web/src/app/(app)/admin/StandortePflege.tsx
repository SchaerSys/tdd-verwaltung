"use client";
import { useActionState, useState } from "react";
import { createLocation, updateLocation, deleteLocation, toggleLocationActive, type LocationState } from "./actions";

export interface StandortZeile {
  id: number; name: string; city: string; type: string; locationCode: number; isActive: boolean; karten: number;
}

/** Anlegen-Formular fuer einen neuen Standort. */
export function StandortAnlegen() {
  const [state, action, pending] = useActionState<LocationState, FormData>(createLocation, { ok: false });
  const [offen, setOffen] = useState(false);
  if (!offen) return <button type="button" className="btn" onClick={() => setOffen(true)}>＋ Standort anlegen</button>;
  return (
    <form action={action} className="flex flex-wrap gap-2 items-end p-3 border border-border rounded" style={{ background: "var(--surface-2)" }}>
      <label className="flex flex-col text-xs gap-1">Name<input name="name" className="inp" required placeholder="Ausgabestelle Hard" /></label>
      <label className="flex flex-col text-xs gap-1">Ort<input name="city" className="inp" required placeholder="Hard" /></label>
      <label className="flex flex-col text-xs gap-1">Typ
        <select name="type" className="inp" defaultValue="AUSGABESTELLE">
          <option value="AUSGABESTELLE">Ausgabestelle</option>
          <option value="LADEN">Laden</option>
        </select>
      </label>
      <label className="flex flex-col text-xs gap-1">Kennung (0–999)<input name="locationCode" className="inp mono" style={{ width: 90 }} inputMode="numeric" required placeholder="213" /></label>
      <button className="btn primary" disabled={pending}>{pending ? "Lege an…" : "Anlegen"}</button>
      <button type="button" className="btn ghost" onClick={() => setOffen(false)}>Abbrechen</button>
      {state.error ? <div className="w-full text-sm text-[color:var(--bad)]">{state.error}</div> : null}
      {state.ok ? <div className="w-full text-sm text-[color:var(--good)]">Angelegt.</div> : null}
    </form>
  );
}

/** Bearbeiten, Deaktivieren und Loeschen fuer eine Zeile. */
export function StandortAktionen({ z, eigeneZeile }: { z: StandortZeile; eigeneZeile?: boolean }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [updState, updAction, updPending] = useActionState<LocationState, FormData>(updateLocation, { ok: false });
  const [delState, delAction, delPending] = useActionState<LocationState, FormData>(deleteLocation, { ok: false });

  if (bearbeiten) {
    return (
      <form action={updAction} className="flex flex-wrap gap-1 items-center">
        <input type="hidden" name="locationId" value={z.id} />
        <input name="name" className="inp" defaultValue={z.name} required style={{ width: 170 }} aria-label="Name" />
        <input name="city" className="inp" defaultValue={z.city} required style={{ width: 110 }} aria-label="Ort" />
        <select name="type" className="inp" defaultValue={z.type} aria-label="Typ">
          <option value="AUSGABESTELLE">Ausgabestelle</option>
          <option value="LADEN">Laden</option>
        </select>
        <input name="locationCode" className="inp mono" defaultValue={z.locationCode} style={{ width: 64 }} inputMode="numeric"
               aria-label="Kennung" disabled={z.karten > 0} title={z.karten > 0 ? `Nicht aenderbar: ${z.karten} Karten tragen diese Kennung` : undefined} />
        <button className="btn primary sm" disabled={updPending}>Speichern</button>
        <button type="button" className="btn ghost sm" onClick={() => setBearbeiten(false)}>Abbrechen</button>
        {updState.error ? <div className="w-full text-xs text-[color:var(--bad)]">{updState.error}</div> : null}
      </form>
    );
  }

  return (
    <div className="flex gap-1 items-center flex-wrap">
      <button type="button" className="btn ghost sm" onClick={() => setBearbeiten(true)}>Bearbeiten</button>
      {!eigeneZeile ? (
        <form action={toggleLocationActive}>
          <input type="hidden" name="locationId" value={z.id} />
          <input type="hidden" name="active" value={z.isActive ? "0" : "1"} />
          <button className="btn ghost sm" type="submit">{z.isActive ? "Deaktivieren" : "Aktivieren"}</button>
        </form>
      ) : null}
      <form action={delAction} onSubmit={(e) => { if (!confirm(`Standort „${z.name}“ wirklich löschen?`)) e.preventDefault(); }}>
        <input type="hidden" name="locationId" value={z.id} />
        <button className="btn ghost sm" type="submit" disabled={delPending} style={{ color: "var(--bad)" }}>Löschen</button>
      </form>
      {delState.error ? <div className="w-full text-xs text-[color:var(--bad)]">{delState.error}</div> : null}
    </div>
  );
}
