"use client";

import { useActionState } from "react";
import { vertragSpeichern, type UnternehmenState } from "../actions";

const MODULE: { key: string; label: string; hinweis: string }[] = [
  { key: "portal", label: "Portal Gemeinden/Institutionen", hinweis: "Anträge, Rückfragen, Bescheide" },
  { key: "personal", label: "Personal & Arbeitszeit", hinweis: "Personalakte, Zeiterfassung, Dienstplan, Abwesenheiten, Lohnexport" },
  { key: "zivildienst", label: "Zivildienst", hinweis: "ZDG-Regeln, Meldungen (setzt Personal voraus)" },
  { key: "touren", label: "Touren & Logistik", hinweis: "Disposition, Fahrzeug-Tablet, Geofencing" },
  { key: "station", label: "Ausgabestation", hinweis: "Wandernder Laptop mit PIN-Anmeldung" },
];

export interface VertragWerte {
  id: string; plan: string; testBis: string | null; vertragBeginn: string | null; vertragEnde: string | null; kuendigungsfrist: string | null;
  limitBenutzer: number | null; limitStandorte: number | null; module: Record<string, boolean>; ansprechpartner: string | null;
}

export function VertragForm({ t, zaehler }: { t: VertragWerte; zaehler: { benutzer: number; standorte: number } }) {
  const [state, action, pending] = useActionState<UnternehmenState, FormData>(vertragSpeichern, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="id" value={t.id} />
      <label className="text-xs">Plan<br />
        <select name="plan" className="inp sm w-full" defaultValue={t.plan}>
          <option value="TEST">Test (befristet)</option><option value="BASIS">Basis</option><option value="PLUS">Plus</option>
        </select></label>
      <label className="text-xs">Testphase bis<br /><input name="testBis" type="date" className="inp sm w-full mono" defaultValue={t.testBis ?? ""} /><span className="text-muted">danach automatisch inaktiv</span></label>
      <label className="text-xs">Ansprechpartner (Verein)<br /><input name="ansprechpartner" className="inp sm w-full" defaultValue={t.ansprechpartner ?? ""} placeholder="Name, Funktion, Telefon" /></label>
      <label className="text-xs">Vertragsbeginn<br /><input name="vertragBeginn" type="date" className="inp sm w-full mono" defaultValue={t.vertragBeginn ?? ""} /></label>
      <label className="text-xs">Vertragsende<br /><input name="vertragEnde" type="date" className="inp sm w-full mono" defaultValue={t.vertragEnde ?? ""} /><span className="text-muted">leer = unbefristet; danach automatisch inaktiv</span></label>
      <label className="text-xs">Kündigungsfrist<br /><input name="kuendigungsfrist" className="inp sm w-full" defaultValue={t.kuendigungsfrist ?? ""} placeholder="z. B. 3 Monate zum Jahresende" /></label>
      <label className="text-xs">Limit Benutzer<br /><input name="limitBenutzer" className="inp sm w-full mono" defaultValue={t.limitBenutzer ?? ""} placeholder="unbegrenzt" /><span className="text-muted">aktuell {zaehler.benutzer}</span></label>
      <label className="text-xs">Limit Standorte<br /><input name="limitStandorte" className="inp sm w-full mono" defaultValue={t.limitStandorte ?? ""} placeholder="unbegrenzt" /><span className="text-muted">aktuell {zaehler.standorte}</span></label>
      <div />
      <div className="sm:col-span-3 border-t border-[color:var(--border)] pt-3">
        <div className="text-xs font-semibold mb-2">Module (abgeschaltete verschwinden aus der Navigation der Fach-App)</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODULE.map((m) => (
            <label key={m.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={`modul_${m.key}`} defaultChecked={t.module[m.key] !== false} style={{ marginTop: 3 }} />
              <span><b>{m.label}</b><br /><span className="text-xs text-muted">{m.hinweis}</span></span>
            </label>
          ))}
        </div>
      </div>
      <div className="sm:col-span-3 flex items-center gap-3">
        <button className="btn sm" type="submit" disabled={pending}>{pending ? "Speichert …" : "Speichern"}</button>
        {state.error ? <span className="pill bad">{state.error}</span> : null}
        {state.info ? <span className="pill good">{state.info}</span> : null}
      </div>
      <p className="sm:col-span-3 text-xs text-muted">Limits sind Zähler mit Hinweis (keine harte Sperre). Grundmodule (Personen, Karten, Ausgabe, Auswertungen) sind immer an.</p>
    </form>
  );
}
