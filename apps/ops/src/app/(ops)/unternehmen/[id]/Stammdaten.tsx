"use client";

import { useActionState } from "react";
import { stammdatenSpeichern, type UnternehmenState } from "../actions";

export interface StammdatenWerte {
  id: string; name: string; host: string | null; kurzname: string | null; anschrift: string | null; vertretung: string | null;
  kontaktEmail: string | null; kontaktTelefon: string | null; website: string | null;
}

export function Stammdaten({ t }: { t: StammdatenWerte }) {
  const [state, action, pending] = useActionState<UnternehmenState, FormData>(stammdatenSpeichern, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={t.id} />
      <label className="text-xs">Name (vollständig)<br /><input name="name" className="inp sm w-full" defaultValue={t.name} required /></label>
      <label className="text-xs">Kurzname (Drucke, Betreffzeilen)<br /><input name="kurzname" className="inp sm w-full" defaultValue={t.kurzname ?? ""} placeholder={t.name} /></label>
      <label className="text-xs">Host der Fach-App<br /><input name="host" className="inp sm w-full mono" defaultValue={t.host ?? ""} placeholder="tirol.tafelwerk.at" /></label>
      <label className="text-xs">Website<br /><input name="website" className="inp sm w-full" defaultValue={t.website ?? ""} placeholder="https://…" /></label>
      <label className="text-xs">Anschrift (Zeilen)<br /><textarea name="anschrift" className="inp sm w-full" rows={3} defaultValue={t.anschrift ?? ""} placeholder={"Straße 1\nA-6000 Ort"} /></label>
      <label className="text-xs">Vertretung / Register (Datenschutzinformation)<br /><textarea name="vertretung" className="inp sm w-full" rows={3} defaultValue={t.vertretung ?? ""} placeholder={"Vereinsregister: ZVR …\nVertreten durch …"} /></label>
      <label className="text-xs">Kontakt-E-Mail<br /><input name="kontaktEmail" type="email" className="inp sm w-full" defaultValue={t.kontaktEmail ?? ""} /></label>
      <label className="text-xs">Kontakt-Telefon<br /><input name="kontaktTelefon" className="inp sm w-full" defaultValue={t.kontaktTelefon ?? ""} /></label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn sm" type="submit" disabled={pending}>{pending ? "Speichert …" : "Speichern"}</button>
        {state.error ? <span className="pill bad">{state.error}</span> : null}
        {state.info ? <span className="pill good">{state.info}</span> : null}
      </div>
      <p className="sm:col-span-2 text-xs text-muted">
        Der Host muss per DNS auf diesen Server zeigen und in der Caddy-Konfiguration eingetragen sein (Zertifikat automatisch). Ohne eigenen Host melden sich die Benutzer über die gemeinsame Login-Seite mit ihrer E-Mail-Adresse an – das System findet den Mandanten des Kontos.
      </p>
    </form>
  );
}
