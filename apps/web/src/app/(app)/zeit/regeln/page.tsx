import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { betriebsfreieTage } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeRegeln } from "@/lib/azg-daten";
import { feiertage } from "@/lib/feiertage";
import { fmtDate } from "@/lib/format";
import { betriebsfreiAnlegen, betriebsfreiLoeschen, regelnSpeichern } from "../azg-actions";

export const dynamic = "force-dynamic";

/** Grenzen nach AZG (KV-abhaengig einstellbar), gesetzliche Feiertage, betriebsfreie Tage. */
export default async function RegelnSeite() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const admin = hasPermission(user.role, "admin:manage");
  const r = await ladeRegeln();
  const jahr = new Date().getFullYear();
  const frei = await db().select().from(betriebsfreieTage).orderBy(asc(betriebsfreieTage.datum));

  return (
    <div>
      <div className="page-h"><div><h1>Arbeitszeit-Regeln</h1><div className="sub">Gesetzliche Grenzen (AZG/ARG) und Zuschläge – bei Kollektivvertrag anpassen</div></div><Link href="/zeit/pruefung" className="btn ghost">← AZG-Prüfung</Link></div>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Grenzen &amp; Zuschläge</h3>{!admin ? <span className="pill muted">nur Admin ändert</span> : null}</div>
          <form action={regelnSpeichern} className="p-4 grid gap-3 sm:grid-cols-2">
            <fieldset disabled={!admin} className="contents">
              <div className="field"><label className="lbl">Tageshöchstarbeitszeit (h)</label><input name="maxTagStd" className="inp mono" defaultValue={r.maxTagMin / 60} /><div className="text-[.7rem] text-muted">§ 9 AZG: 10 h, 12 h nur mit Ausnahme</div></div>
              <div className="field"><label className="lbl">Wochenhöchstarbeitszeit (h)</label><input name="maxWocheStd" className="inp mono" defaultValue={r.maxWocheMin / 60} /><div className="text-[.7rem] text-muted">§ 9 AZG: 50 h, Ø 48 h in 17 Wochen</div></div>
              <div className="field"><label className="lbl">Ruhepause ab (h)</label><input name="pauseAbStd" className="inp mono" defaultValue={r.pauseAbMin / 60} /><div className="text-[.7rem] text-muted">§ 11 AZG: ab 6 h</div></div>
              <div className="field"><label className="lbl">Ruhepause (min)</label><input name="pauseMin" className="inp mono" defaultValue={r.pauseMin} /><div className="text-[.7rem] text-muted">30 min</div></div>
              <div className="field"><label className="lbl">Tägliche Ruhezeit (h)</label><input name="ruhezeitStd" className="inp mono" defaultValue={r.ruhezeitMin / 60} /><div className="text-[.7rem] text-muted">§ 12 AZG: 11 h</div></div>
              <div className="field"><label className="lbl">Normalarbeitszeit/Woche (h)</label><input name="normalStd" className="inp mono" defaultValue={r.normalarbeitszeitWocheMin / 60} /><div className="text-[.7rem] text-muted">§ 3 AZG: 40 h (KV oft 38,5)</div></div>
              <div className="field"><label className="lbl">Zuschlag Mehrarbeit Teilzeit (%)</label><input name="mehrarbeitZuschlag" className="inp mono" defaultValue={r.mehrarbeitZuschlag} /><div className="text-[.7rem] text-muted">§ 19d AZG: 25 %</div></div>
              <div className="field"><label className="lbl">Zuschlag Überstunden (%)</label><input name="ueberstundenZuschlag" className="inp mono" defaultValue={r.ueberstundenZuschlag} /><div className="text-[.7rem] text-muted">§ 10 AZG: 50 %</div></div>
              <div className="field sm:col-span-2"><label className="lbl">Kollektivvertrag (falls anwendbar)</label><input name="kollektivvertrag" className="inp" defaultValue={r.kollektivvertrag ?? ""} placeholder="z. B. SWÖ-KV – oder leer, wenn keiner gilt" /></div>
              <div className="field sm:col-span-2"><label className="flex items-center gap-2 text-[.8125rem]"><input type="checkbox" name="ausgabeStempelt" defaultChecked={r.ausgabeStempelt} /> Ausgabestation: „Ausgabe starten/beenden“ stempelt Kommen/Gehen in die Zeiterfassung</label></div>
              <div className="sm:col-span-2 border-t border-[color:var(--border)] pt-3 text-[.8125rem] font-semibold">Arbeitgeber-Angaben für den Dienstzettel (§ 2 AVRAG)</div>
              <div className="field"><label className="lbl">Arbeitgeber</label><input name="arbeitgeberName" className="inp" defaultValue={r.arbeitgeberName} /></div>
              <div className="field"><label className="lbl">Anschrift (Sitz)</label><input name="arbeitgeberAnschrift" className="inp" defaultValue={r.arbeitgeberAnschrift ?? ""} placeholder="Straße, PLZ Ort" /></div>
              <div className="field"><label className="lbl">Betriebliche Vorsorgekasse</label><input name="bvKasse" className="inp" defaultValue={r.bvKasse ?? ""} placeholder="Name und Anschrift der BV-Kasse" /></div>
              <div className="field"><label className="lbl">Sozialversicherungsträger</label><input name="svTraeger" className="inp" defaultValue={r.svTraeger} /></div>
              <div className="field sm:col-span-2"><label className="lbl">Einsichtnahme in KV/Betriebsvereinbarung</label><input name="kvEinsicht" className="inp" defaultValue={r.kvEinsicht ?? ""} placeholder="z. B. Büro Vandans – entfällt ohne KV" /></div>
              {admin ? <div><button className="btn primary" type="submit">Speichern</button></div> : null}
            </fieldset>
          </form>
        </div>
        <div className="flex flex-col gap-4">
          <div className="panel">
            <div className="panel-h"><h3>Gesetzliche Feiertage {jahr}</h3><span className="pill muted">automatisch</span></div>
            <ul className="p-3 grid gap-1 sm:grid-cols-2 text-[.8125rem]">{feiertage(jahr).map((f) => <li key={f.datum}><span className="mono text-muted">{fmtDate(f.datum)}</span> {f.name}</li>)}</ul>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Betriebsfreie Tage</h3><span className="pill muted">{frei.length}</span></div>
            <ul className="p-3 flex flex-col gap-1 text-[.8125rem]">
              {frei.map((f) => <li key={f.datum} className="flex items-center gap-2"><span className="mono text-muted">{fmtDate(f.datum)}</span><span className="flex-1">{f.name}</span>{admin ? <form action={betriebsfreiLoeschen}><input type="hidden" name="datum" value={f.datum} /><button className="btn ghost sm" type="submit">✕</button></form> : null}</li>)}
              {frei.length === 0 ? <li className="text-muted">Keine – z. B. 24.12., 31.12., Betriebsurlaub eintragen. Zählen wie Feiertage (Gutschrift des Tagessolls).</li> : null}
            </ul>
            {admin ? <form action={betriebsfreiAnlegen} className="p-3 border-t border-[color:var(--border)] flex gap-2 items-end"><div className="field"><label className="lbl">Datum</label><input name="datum" type="date" className="inp mono" required /></div><div className="field flex-1"><label className="lbl">Bezeichnung</label><input name="name" className="inp" placeholder="Heiliger Abend" required /></div><button className="btn sm" type="submit">＋</button></form> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
