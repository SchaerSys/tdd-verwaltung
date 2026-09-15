import { WOCHENTAGE_KURZ } from "@/lib/touren";

export const ABHOL_ART_LABEL: Record<string, string> = {
  SUPERMARKT: "Supermarkt", BAECKEREI: "Bäckerei", GROSSHANDEL: "Großhandel", GASTRO: "Gastronomie", LANDWIRT: "Landwirtschaft", SONSTIGES: "Sonstiges",
};

export interface AbholstelleWerte {
  name: string; art: string; strasse: string | null; plz: string | null; ort: string | null; ansprechperson: string | null; telefon: string | null; email: string | null;
  kuehlbedarf: boolean; abholtage: number[]; fensterVon: string | null; fensterBis: string | null; hinweise: string | null; isActive?: boolean;
}

/** Formularfelder einer Abholstelle (Anlegen und Bearbeiten). */
export function AbholstelleFelder({ a }: { a?: AbholstelleWerte }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="field"><label className="lbl">Name (Betrieb) *</label><input name="name" className="inp" defaultValue={a?.name ?? ""} required placeholder="Spar Hard" /></div>
      <div className="field"><label className="lbl">Art</label><select name="art" className="inp" defaultValue={a?.art ?? "SUPERMARKT"}>{Object.entries(ABHOL_ART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label className="lbl">Kühlware</label><label className="flex items-center gap-1 mt-2 text-[.8125rem]"><input type="checkbox" name="kuehlbedarf" defaultChecked={a?.kuehlbedarf} /> ❄ braucht Kühlfahrzeug</label></div>
      <div className="field"><label className="lbl">Straße</label><input name="strasse" className="inp" defaultValue={a?.strasse ?? ""} /></div>
      <div className="field"><label className="lbl">PLZ</label><input name="plz" className="inp mono" defaultValue={a?.plz ?? ""} /></div>
      <div className="field"><label className="lbl">Ort</label><input name="ort" className="inp" defaultValue={a?.ort ?? ""} /></div>
      <div className="field"><label className="lbl">Ansprechperson</label><input name="ansprechperson" className="inp" defaultValue={a?.ansprechperson ?? ""} /></div>
      <div className="field"><label className="lbl">Telefon</label><input name="telefon" className="inp mono" defaultValue={a?.telefon ?? ""} /></div>
      <div className="field"><label className="lbl">E-Mail</label><input name="email" type="email" className="inp" defaultValue={a?.email ?? ""} /></div>
      <div className="field"><label className="lbl">Abholtage</label>
        <div className="flex gap-2 flex-wrap mt-2 text-[.8125rem]">{[1, 2, 3, 4, 5, 6, 7].map((t) => <label key={t} className="flex items-center gap-1"><input type="checkbox" name="abholtage" value={t} defaultChecked={a?.abholtage.includes(t)} />{WOCHENTAGE_KURZ[t]}</label>)}</div></div>
      <div className="field"><label className="lbl">Abholfenster von – bis</label><div className="flex gap-1"><input name="fensterVon" type="time" className="inp mono" defaultValue={a?.fensterVon?.slice(0, 5) ?? ""} /><input name="fensterBis" type="time" className="inp mono" defaultValue={a?.fensterBis?.slice(0, 5) ?? ""} /></div></div>
      <div className="field"><label className="lbl">Hinweise für Fahrer:innen</label><input name="hinweise" className="inp" defaultValue={a?.hinweise ?? ""} placeholder="Rampe hinten, Klingel am Tor, Kisten zurückbringen" /></div>
      {a && a.isActive !== undefined ? <div className="field"><label className="lbl">Status</label><label className="flex items-center gap-1 mt-2 text-[.8125rem]"><input type="checkbox" name="isActive" defaultChecked={a.isActive} /> aktiv</label></div> : null}
    </div>
  );
}
