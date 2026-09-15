import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { fahrzeuge, staff, tourVorlageStopps, tourVorlagen } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { WOCHENTAGE, zeitKurz } from "@/lib/touren";
import { planStammdaten } from "@/lib/touren-daten";
import { vorlageAnlegen } from "../actions";

export const dynamic = "force-dynamic";

/** Wochenplan: die wiederkehrenden Touren je Wochentag. */
export default async function WochenplanSeite() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const stoppZahl = db().select({ id: tourVorlageStopps.vorlageId, n: sql<number>`count(*)::int`.as("n") }).from(tourVorlageStopps).groupBy(tourVorlageStopps.vorlageId).as("sz");
  const [liste, sd] = await Promise.all([
    db().select({ v: tourVorlagen, n: stoppZahl.n, fahrerFirst: staff.firstName, fahrerLast: staff.lastName, kennzeichen: fahrzeuge.kennzeichen })
      .from(tourVorlagen).leftJoin(stoppZahl, eq(stoppZahl.id, tourVorlagen.id)).leftJoin(staff, eq(tourVorlagen.fahrerId, staff.id)).leftJoin(fahrzeuge, eq(tourVorlagen.fahrzeugId, fahrzeuge.id))
      .orderBy(asc(tourVorlagen.wochentag), asc(tourVorlagen.startzeit), asc(tourVorlagen.name)),
    planStammdaten(),
  ]);

  return (
    <div>
      <div className="page-h">
        <div><h1>Wochenplan</h1><div className="sub">{liste.filter((r) => r.v.isActive).length} Tourvorlagen · daraus entstehen die Touren des Tages</div></div>
        <Link href="/touren" className="btn ghost">← Disposition</Link>
      </div>

      <div className="panel mb-4">
        <details>
          <summary className="p-3 cursor-pointer font-semibold text-[.8125rem]">＋ Tourvorlage anlegen</summary>
          <form action={vorlageAnlegen} className="p-4 border-t border-[color:var(--border)] grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <div className="field"><label className="lbl">Name *</label><input name="name" className="inp" required placeholder="Bludenz Montag" /></div>
            <div className="field"><label className="lbl">Wochentag *</label><select name="wochentag" className="inp" required>{[1, 2, 3, 4, 5, 6, 7].map((t) => <option key={t} value={t}>{WOCHENTAGE[t]}</option>)}</select></div>
            <div className="field"><label className="lbl">Startzeit</label><input name="startzeit" type="time" className="inp mono" /></div>
            <div className="field"><label className="lbl">Start ab</label><select name="startLocationId" className="inp" defaultValue={sd.orte.find((o) => o.type === "LAGER")?.id ?? ""}><option value="">—</option>{sd.orte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
            <div className="field"><label className="lbl">Standard-Fahrzeug</label><select name="fahrzeugId" className="inp"><option value="">—</option>{sd.wagen.filter((w) => w.isActive).map((w) => <option key={w.id} value={w.id}>{w.kennzeichen} · {w.bezeichnung}</option>)}</select></div>
            <div className="field"><label className="lbl">Standard-Fahrer:in</label><select name="fahrerId" className="inp"><option value="">—</option>{sd.fahrer.filter((f) => f.kannFahren).map((f) => <option key={f.id} value={f.id}>{f.lastName} {f.firstName}</option>)}</select></div>
            <div className="field sm:col-span-2"><label className="lbl">Hinweise</label><input name="hinweise" className="inp" /></div>
            <div><button className="btn primary" type="submit">Anlegen und Stopps erfassen</button></div>
          </form>
        </details>
      </div>

      {[1, 2, 3, 4, 5, 6, 7].map((wt) => {
        const tag = liste.filter((r) => r.v.wochentag === wt);
        if (tag.length === 0) return null;
        return (
          <div className="panel mb-3" key={wt}>
            <div className="panel-h"><h3>{WOCHENTAGE[wt]}</h3><span className="pill muted">{tag.length}</span></div>
            <div className="twrap"><table className="data">
              <thead><tr><th>Tour</th><th>Start</th><th className="text-right">Stopps</th><th>Standard-Fahrer:in</th><th>Standard-Fahrzeug</th><th></th></tr></thead>
              <tbody>{tag.map(({ v, n, fahrerFirst, fahrerLast, kennzeichen }) => (
                <tr key={v.id} style={v.isActive ? undefined : { opacity: .55 }}>
                  <td><Link href={`/touren/vorlagen/${v.id}`} className="font-semibold hover:underline">{v.name}</Link>{!v.isActive ? <span className="pill muted" style={{ marginLeft: 6 }}>inaktiv</span> : null}</td>
                  <td className="mono text-xs">{zeitKurz(v.startzeit) || "—"}</td>
                  <td className="mono text-right">{n ?? 0}</td>
                  <td>{fahrerLast ? `${fahrerLast} ${fahrerFirst}` : <span className="text-muted">—</span>}</td>
                  <td className="mono text-xs">{kennzeichen ?? "—"}</td>
                  <td><Link href={`/touren/vorlagen/${v.id}`} className="btn ghost sm">Bearbeiten →</Link></td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        );
      })}
      {liste.length === 0 ? <div className="panel"><div className="empty">Noch keine Vorlagen. Für jede wiederkehrende Tour eine anlegen (z. B. „Bludenz Montag“), dann Stopps in Reihenfolge erfassen.</div></div> : null}
    </div>
  );
}
