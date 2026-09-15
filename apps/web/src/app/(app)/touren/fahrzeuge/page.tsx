import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { fahrzeuge } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { heuteIso } from "@/lib/touren";
import { planStammdaten } from "@/lib/touren-daten";
import { fmtDate } from "@/lib/format";
import { fahrzeugAnlegen, fahrzeugSpeichern } from "../actions";

export const dynamic = "force-dynamic";

export default async function FahrzeugeSeite() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const [liste, sd] = await Promise.all([db().select().from(fahrzeuge).orderBy(asc(fahrzeuge.kennzeichen)), planStammdaten()]);
  const heute = heuteIso();
  const bald = (d: string | null) => !!d && d <= heute.slice(0, 4) + "-12-31" && d >= heute; // Pickerl im laufenden Jahr faellig

  const Felder = ({ f }: { f?: typeof liste[number] }) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="field"><label className="lbl">Kennzeichen *</label><input name="kennzeichen" className="inp mono" defaultValue={f?.kennzeichen ?? ""} required placeholder="B 123 TDD" /></div>
      <div className="field"><label className="lbl">Bezeichnung *</label><input name="bezeichnung" className="inp" defaultValue={f?.bezeichnung ?? ""} required placeholder="VW e-Crafter Kühl" /></div>
      <div className="field"><label className="lbl">Ladevolumen</label><input name="ladevolumen" className="inp" defaultValue={f?.ladevolumen ?? ""} placeholder="8 Rollcontainer" /></div>
      <div className="field"><label className="lbl">Heimatstandort</label><select name="locationId" className="inp" defaultValue={f?.locationId ?? ""}><option value="">—</option>{sd.orte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
      <div className="field"><label className="lbl">Ausstattung</label>
        <div className="flex gap-3 mt-2 text-[.8125rem]"><label className="flex items-center gap-1"><input type="checkbox" name="kuehlung" defaultChecked={f?.kuehlung} /> ❄ Kühlung</label><label className="flex items-center gap-1"><input type="checkbox" name="elektrisch" defaultChecked={f?.elektrisch} /> ⚡ elektrisch</label></div></div>
      <div className="field"><label className="lbl">Reichweite (km)</label><input name="reichweiteKm" className="inp mono" inputMode="numeric" defaultValue={f?.reichweiteKm ?? ""} /></div>
      <div className="field"><label className="lbl">§57a Pickerl bis</label><input name="pickerlBis" type="date" className="inp mono" defaultValue={f?.pickerlBis ?? ""} /></div>
      <div className="field"><label className="lbl">Außer Betrieb (Werkstatt) von – bis</label><div className="flex gap-1"><input name="ausserBetriebVon" type="date" className="inp mono" defaultValue={f?.ausserBetriebVon ?? ""} /><input name="ausserBetriebBis" type="date" className="inp mono" defaultValue={f?.ausserBetriebBis ?? ""} /></div></div>
      <div className="field sm:col-span-2 lg:col-span-3"><label className="lbl">Hinweise</label><input name="hinweise" className="inp" defaultValue={f?.hinweise ?? ""} placeholder="Ladekabel im Lager, AdBlue, …" /></div>
      {f ? <div className="field"><label className="lbl">Status</label><label className="flex items-center gap-1 mt-2 text-[.8125rem]"><input type="checkbox" name="isActive" defaultChecked={f.isActive} /> aktiv</label></div> : null}
    </div>
  );

  return (
    <div>
      <div className="page-h">
        <div><h1>Fahrzeuge</h1><div className="sub">{liste.filter((f) => f.isActive).length} aktiv · {liste.filter((f) => f.kuehlung).length} mit Kühlung · {liste.filter((f) => f.elektrisch).length} elektrisch</div></div>
        <Link href="/touren" className="btn ghost">← Disposition</Link>
      </div>

      <div className="panel mb-4">
        <details>
          <summary className="p-3 cursor-pointer font-semibold text-[.8125rem]">＋ Fahrzeug anlegen</summary>
          <form action={fahrzeugAnlegen} className="p-4 border-t border-[color:var(--border)] flex flex-col gap-3"><Felder /><div><button className="btn primary" type="submit">Anlegen</button></div></form>
        </details>
      </div>

      <div className="flex flex-col gap-3">
        {liste.map((f) => {
          const werkstatt = !!f.ausserBetriebVon && f.ausserBetriebVon <= heute && (!f.ausserBetriebBis || f.ausserBetriebBis >= heute);
          return (
            <details key={f.id} className="panel" style={f.isActive ? undefined : { opacity: .6 }}>
              <summary className="p-3 cursor-pointer flex gap-2 items-center flex-wrap list-none">
                <b className="mono">{f.kennzeichen}</b><span>{f.bezeichnung}</span>
                {f.kuehlung ? <span className="pill tag-out">❄ Kühlung</span> : null}{f.elektrisch ? <span className="pill good">⚡ {f.reichweiteKm ? `${f.reichweiteKm} km` : "elektrisch"}</span> : null}
                {werkstatt ? <span className="pill bad">Werkstatt{f.ausserBetriebBis ? ` bis ${fmtDate(f.ausserBetriebBis)}` : ""}</span> : null}
                {f.pickerlBis && f.pickerlBis < heute ? <span className="pill bad">Pickerl abgelaufen</span> : bald(f.pickerlBis) ? <span className="pill warn">Pickerl bis {fmtDate(f.pickerlBis)}</span> : null}
                {!f.isActive ? <span className="pill muted">stillgelegt</span> : null}
                <span className="text-xs text-muted ml-auto">{f.ladevolumen ?? ""}</span>
              </summary>
              <form action={fahrzeugSpeichern} className="p-4 border-t border-[color:var(--border)] flex flex-col gap-3"><input type="hidden" name="id" value={f.id} /><Felder f={f} /><div><button className="btn primary sm" type="submit">Speichern</button></div></form>
            </details>
          );
        })}
        {liste.length === 0 ? <div className="panel"><div className="empty">Noch keine Fahrzeuge. Die 22 Fahrzeuge oben anlegen – oder Liste schicken, dann importiere ich sie.</div></div> : null}
      </div>
    </div>
  );
}
