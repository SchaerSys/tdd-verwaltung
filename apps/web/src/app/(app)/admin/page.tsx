import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { locations, lookupLists, lookupValues } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { WEEKDAYS, WEEKDAY_LABEL, asOpeningHours, hasAnyHours } from "@/lib/opening-hours";
import { setLocationPrice, setLocationHours } from "./actions";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) redirect("/dashboard");

  const d = db();
  const locs = await d.select().from(locations).orderBy(asc(locations.type), asc(locations.name));
  const lists = await d.select().from(lookupLists).orderBy(asc(lookupLists.code));
  const values = await d.select().from(lookupValues).orderBy(asc(lookupValues.listId), asc(lookupValues.sort));
  const valuesByList = (listId: number) => values.filter((v) => v.listId === listId);

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Stammdaten</h1>
          <div className="sub">Standorte, Preise, Öffnungszeiten &amp; Auswahllisten</div>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/benutzer" className="btn">👤 Benutzerverwaltung</Link>
          <Link href="/admin/import" className="btn primary">⬆ Excel-Import</Link>
        </div>
      </div>

      {/* Standorte + Preise */}
      <div className="panel mb-4">
        <div className="panel-h"><h3>Standorte &amp; Preise</h3><span className="pill muted">{locs.length}</span></div>
        <div className="twrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Typ</th><th>Ort</th><th>Kennung</th><th>Preis (Erw. / Kind) &amp; Gruppen</th><th>Status</th></tr></thead>
            <tbody>
              {locs.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.name}</b></td>
                  <td><span className={`pill ${l.type === "LADEN" ? "tag-shop" : "tag-out"}`}>{l.type === "LADEN" ? "Laden" : "Ausgabestelle"}</span></td>
                  <td>{l.city}</td>
                  <td className="mono">{l.locationCode}</td>
                  <td>
                    {l.type === "LADEN" ? <span className="muted">—</span> : (
                      <form action={setLocationPrice} className="flex gap-1 items-center">
                        <input type="hidden" name="locationId" value={l.id} />
                        <input name="priceAdult" className="inp mono" style={{ width: 64 }} defaultValue={Number(l.priceAdult).toFixed(2)} inputMode="decimal" aria-label="Preis Erwachsene" />
                        <span className="muted">/</span>
                        <input name="priceChild" className="inp mono" style={{ width: 64 }} defaultValue={Number(l.priceChild).toFixed(2)} inputMode="decimal" aria-label="Preis Kind" />
                        <span className="muted" style={{ marginLeft: 8 }}>Gruppen</span>
                        <input name="groupCount" className="inp mono" style={{ width: 54 }} defaultValue={l.groupCount} inputMode="numeric" aria-label="Anzahl Gruppen" />
                        <button className="btn ghost sm" type="submit">Speichern</button>
                      </form>
                    )}
                  </td>
                  <td>{l.isActive ? <span className="pill good"><span className="dot" />Aktiv</span> : <span className="pill muted">Inaktiv</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Öffnungszeiten */}
      <div className="panel mb-4">
        <div className="panel-h"><h3>Öffnungszeiten</h3><span className="sec-hint">ein Zeitfenster je Wochentag · leer = geschlossen</span></div>
        <div>
          {locs.map((l) => {
            const oh = asOpeningHours(l.openingHours);
            return (
              <details key={l.id} className="acc" style={{ borderBottom: "1px solid var(--border)" }}>
                <summary className="acc-sum">
                  <span className="acc-name">{l.type === "LADEN" ? "🏪" : "📦"} {l.name}</span>
                  <span className="acc-meta">
                    {hasAnyHours(oh)
                      ? WEEKDAYS.filter((wd) => (oh[wd]?.length ?? 0) > 0).map((wd) => <span key={wd} className="pill muted">{WEEKDAY_LABEL[wd]}</span>)
                      : <span className="muted">keine Zeiten</span>}
                  </span>
                </summary>
                <form action={setLocationHours} className="p-4">
                  <input type="hidden" name="locationId" value={l.id} />
                  <div className="grid gap-2" style={{ maxWidth: 360 }}>
                    {WEEKDAYS.map((wd) => {
                      const slot = oh[wd]?.[0];
                      return (
                        <div key={wd} className="flex items-center gap-2">
                          <span className="lbl" style={{ width: 34 }}>{WEEKDAY_LABEL[wd]}</span>
                          <input type="time" name={`${wd}_from`} className="inp mono" defaultValue={slot?.from ?? ""} style={{ width: 130 }} />
                          <span className="muted">–</span>
                          <input type="time" name={`${wd}_to`} className="inp mono" defaultValue={slot?.to ?? ""} style={{ width: 130 }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3"><button className="btn primary sm" type="submit">Öffnungszeiten speichern</button></div>
                </form>
              </details>
            );
          })}
        </div>
      </div>

      {/* Auswahllisten */}
      <div className="panel">
        <div className="panel-h"><h3>Auswahllisten</h3><span className="pill muted">{lists.length}</span></div>
        <div className="p-4 grid gap-4 sm:grid-cols-2">
          {lists.map((li) => (
            <div key={li.id}>
              <div className="lbl mb-2">{li.code === "language" ? "Sprache" : li.code === "origin" ? "Herkunft" : li.code}</div>
              <div className="flex flex-wrap gap-2">
                {valuesByList(li.id).map((v) => (
                  <span key={v.id} className="pill muted">{v.label}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
