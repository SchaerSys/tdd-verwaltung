import { asc } from "drizzle-orm";
import { locations, lookupLists, lookupValues, organizations, retentionRules } from "@tdd/db";
import { db } from "@/lib/db";
import { auswahlwertHinzufuegen, auswahlwertSchalten, fristSpeichern, organisationSchalten, standortSpeichern } from "./actions";

export const dynamic = "force-dynamic";

/** Konfiguration ohne Personenbezug: Standorte, Loeschfristen, Auswahllisten, Organisationen. */
export default async function KonfigurationSeite({ searchParams }: { searchParams: Promise<{ orgs?: string }> }) {
  const sp = await searchParams;
  const d = await db();
  const [standorte, fristen, listen, werte, orgs] = await Promise.all([
    d.select().from(locations).orderBy(asc(locations.type), asc(locations.name)),
    d.select().from(retentionRules).orderBy(asc(retentionRules.entityType)),
    d.select().from(lookupLists).orderBy(asc(lookupLists.code)),
    d.select().from(lookupValues).orderBy(asc(lookupValues.listId), asc(lookupValues.sort), asc(lookupValues.label)),
    d.select().from(organizations).orderBy(asc(organizations.type), asc(organizations.name)),
  ]);
  const orgsAnzeigen = sp.orgs === "1";

  return (
    <div>
      <div className="page-h"><div><h1>Konfiguration</h1><div className="sub">Stammdaten der Fach-App – Änderungen wirken sofort</div></div></div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Standorte</h3><span className="pill muted">{standorte.length}</span><span className="text-xs text-muted" style={{ marginLeft: 8 }}>Kennung und Typ nur in der Fach-App (Karten hängen daran).</span></div>
        <div className="twrap"><table className="data">
          <thead><tr><th>Kennung</th><th>Typ</th><th>Name</th><th>Ort</th><th>Preise</th><th>Aktiv</th><th></th></tr></thead>
          <tbody>{standorte.map((s) => (
            <tr key={s.id}>
              <td className="mono">{String(s.locationCode).padStart(3, "0")}</td>
              <td><span className={`pill ${s.type === "LADEN" ? "tag-shop" : "tag-out"}`}>{s.type === "LADEN" ? "Laden" : "Ausgabestelle"}</span></td>
              <td colSpan={5}>
                <form action={standortSpeichern} className="flex gap-2 items-center flex-wrap">
                  <input type="hidden" name="id" value={s.id} />
                  <input name="name" className="inp sm" defaultValue={s.name} style={{ width: 180 }} required />
                  <input name="city" className="inp sm" defaultValue={s.city} style={{ width: 140 }} required />
                  <span className="mono text-xs text-muted">{s.priceAdult} € / {s.priceChild} €</span>
                  <label className="text-xs flex items-center gap-1"><input type="checkbox" name="isActive" defaultChecked={s.isActive} /> aktiv</label>
                  <button className="btn ghost sm" type="submit">Speichern</button>
                </form>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Löschfristen (DSGVO)</h3><span className="text-xs text-muted" style={{ marginLeft: 8 }}>Format: Zahl + days/months/years, z. B. „3 years“. Der Löschjob läuft nachts.</span></div>
        <div className="twrap"><table className="data">
          <thead><tr><th>Datenart</th><th>Frist</th><th>Rechtsgrundlage / Hinweis</th><th>Aktiv</th><th></th></tr></thead>
          <tbody>{fristen.map((f) => (
            <tr key={f.id}>
              <td className="mono">{f.entityType}</td>
              <td colSpan={4}>
                <form action={fristSpeichern} className="flex gap-2 items-center flex-wrap">
                  <input type="hidden" name="id" value={f.id} />
                  <input name="retentionPeriod" className="inp sm mono" defaultValue={f.retentionPeriod.replace(/^(\d+) (\w+)$/, "$1 $2")} pattern="\d+ (day|days|month|months|year|years)" style={{ width: 120 }} required />
                  <span className="text-xs text-muted flex-1">{f.legalBasis ?? "—"}</span>
                  <label className="text-xs flex items-center gap-1"><input type="checkbox" name="isActive" defaultChecked={f.isActive} /> aktiv</label>
                  <button className="btn ghost sm" type="submit">Speichern</button>
                </form>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {listen.map((l) => {
          const w = werte.filter((v) => v.listId === l.id);
          return (
            <div className="panel" key={l.id}>
              <div className="panel-h"><h3>Auswahlliste „{l.code}“</h3><span className="pill muted">{w.length}</span></div>
              <ul className="p-3 flex flex-col gap-1 text-[.8125rem]">
                {w.map((v) => (
                  <li key={v.id} className="flex items-center gap-2" style={v.isActive ? undefined : { opacity: .5 }}>
                    <span className="flex-1">{v.label}</span>
                    <form action={auswahlwertSchalten}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="aktiv" value={v.isActive ? "0" : "1"} />
                      <button className="btn ghost sm" type="submit">{v.isActive ? "ausblenden" : "einblenden"}</button></form>
                  </li>
                ))}
              </ul>
              <form action={auswahlwertHinzufuegen} className="p-3 border-t border-[color:var(--border)] flex gap-2">
                <input type="hidden" name="listId" value={l.id} />
                <input name="label" className="inp sm flex-1" placeholder="Neuer Wert" required />
                <button className="btn sm" type="submit">＋</button>
              </form>
            </div>
          );
        })}
      </div>

      <div className="panel mt-4">
        <div className="panel-h"><h3>Organisationen (Portal)</h3><span className="pill muted">{orgs.length}</span>
          {!orgsAnzeigen ? <a href="/konfiguration?orgs=1" className="btn ghost sm" style={{ marginLeft: "auto" }}>Alle anzeigen</a> : null}</div>
        {orgsAnzeigen ? (
          <div className="twrap"><table className="data">
            <thead><tr><th>Typ</th><th>Name</th><th>Aktiv</th><th></th></tr></thead>
            <tbody>{orgs.map((o) => (
              <tr key={o.id} style={o.isActive ? undefined : { opacity: .5 }}>
                <td><span className="pill muted">{o.type}</span></td><td>{o.name}</td>
                <td>{o.isActive ? "ja" : "nein"}</td>
                <td><form action={organisationSchalten}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="aktiv" value={o.isActive ? "0" : "1"} />
                  <button className="btn ghost sm" type="submit">{o.isActive ? "Deaktivieren" : "Aktivieren"}</button></form></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="p-4 text-[.8125rem] text-muted">{orgs.filter((o) => o.type === "GEMEINDE").length} Gemeinden · {orgs.filter((o) => o.type === "INSTITUTION").length} Institutionen · {orgs.filter((o) => !o.isActive).length} deaktiviert</div>}
      </div>
    </div>
  );
}
