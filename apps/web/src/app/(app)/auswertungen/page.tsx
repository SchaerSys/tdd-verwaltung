import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { loadReports } from "@/lib/reports";
import { fmtDate } from "@/lib/format";

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return <div className="h-[7px] rounded bg-[color:var(--surface-2)] overflow-hidden"><div className="h-full bg-[color:var(--accent)]" style={{ width: `${pct}%` }} /></div>;
}

export default async function AuswertungenPage({ searchParams }: { searchParams: Promise<{ herkunft?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "report:view")) redirect("/dashboard");

  const { herkunft } = await searchParams;
  const r = await loadReports();
  const origins = r.byOrigin.filter((o) => !herkunft || herkunft === "all" || o.org_type === herkunft);
  const originGemeinde = r.byOrigin.filter((o) => o.org_type === "GEMEINDE").reduce((s, o) => s + o.n, 0);
  const originInstitution = r.byOrigin.filter((o) => o.org_type === "INSTITUTION").reduce((s, o) => s + o.n, 0);
  const totalPersons = r.byLocation.reduce((s, l) => s + l.active_persons, 0);
  const totalCards = r.byLocation.reduce((s, l) => s + l.active_cards, 0);
  const dist30 = r.distByLocation.reduce((s, l) => s + l.d30, 0);
  const newTotal = r.newPersonsMonthly.reduce((s, m) => s + m.n, 0);
  const maxLoc = Math.max(1, ...r.byLocation.map((l) => l.active_persons));
  const maxMonth = Math.max(1, ...r.distMonthly.map((m) => m.n), ...r.newPersonsMonthly.map((m) => m.n));

  return (
    <div>
      <div className="page-h">
        <div><h1>Auswertungen</h1><div className="sub">Alle Standorte · Stand {fmtDate(new Date())}</div></div>
        <a href="/auswertungen/export" className="btn primary">⬇ Excel-Export</a>
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(190px,1fr))] mb-4">
        <div className="card stat"><div className="k">Aktuell berechtigt</div><div className="v">{totalPersons}</div><div className="d">über {r.byLocation.length} Standorte</div></div>
        <div className="card stat"><div className="k">Aktive Karten</div><div className="v">{totalCards}</div></div>
        <div className="card stat"><div className="k">Ausgaben (30 Tage)</div><div className="v">{dist30}</div></div>
        <div className="card stat"><div className="k">Neuaufnahmen (12 Mon.)</div><div className="v">{newTotal}</div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Berechtigte je Standort</h3></div>
          <div className="p-4 flex flex-col gap-3">
            {r.byLocation.map((l) => (
              <div key={l.location_name}>
                <div className="flex justify-between text-[.8125rem]"><span>{l.location_name}</span><b className="mono">{l.active_persons}</b></div>
                <Bar value={l.active_persons} max={maxLoc} />
              </div>
            ))}
            {r.byLocation.length === 0 ? <div className="empty">Keine Daten.</div> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Ausgaben je Standort</h3></div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Standort</th><th>30 Tage</th><th>Gesamt</th></tr></thead>
            <tbody>{r.distByLocation.map((l) => (
              <tr key={l.name}><td>{l.name}</td><td className="mono">{l.d30}</td><td className="mono">{l.total}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start mt-4">
        <div className="panel">
          <div className="panel-h"><h3>Ausgaben über Zeit (monatlich)</h3></div>
          <div className="p-4 flex items-end gap-2 h-[160px]">
            {r.distMonthly.length === 0 ? <div className="empty w-full">Noch keine Ausgaben.</div> :
              r.distMonthly.map((m) => (
                <div key={m.monat} className="flex-1 flex flex-col items-center gap-1 justify-end h-full">
                  <div className="w-full rounded-t bg-[color:var(--accent)]" style={{ height: `${Math.max(4, (m.n / maxMonth) * 130)}px` }} title={`${m.n}`} />
                  <span className="text-[.6rem] text-[color:var(--muted)]">{m.monat.slice(5)}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Neuaufnahmen (monatlich)</h3></div>
          <div className="p-4 flex items-end gap-2 h-[160px]">
            {r.newPersonsMonthly.length === 0 ? <div className="empty w-full">Keine Daten.</div> :
              r.newPersonsMonthly.map((m) => (
                <div key={m.monat} className="flex-1 flex flex-col items-center gap-1 justify-end h-full">
                  <div className="w-full rounded-t bg-[color:var(--good)]" style={{ height: `${Math.max(4, (m.n / maxMonth) * 130)}px` }} title={`${m.n}`} />
                  <span className="text-[.6rem] text-[color:var(--muted)]">{m.monat.slice(5)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start mt-4">
        <div className="panel">
          <div className="panel-h"><h3>Dubletten</h3></div>
          <div className="p-4 grid grid-cols-3 gap-3 text-center">
            <div><div className="v text-[1.4rem] font-bold mono">{r.duplicates.merged}</div><div className="text-[.72rem] text-[color:var(--muted)]">zusammengeführt</div></div>
            <div><div className="v text-[1.4rem] font-bold mono" style={{ color: "var(--warn)" }}>{r.duplicates.create_new}</div><div className="text-[.72rem] text-[color:var(--muted)]">trotz Warnung neu</div></div>
            <div><div className="v text-[1.4rem] font-bold mono">{r.duplicates.linked}</div><div className="text-[.72rem] text-[color:var(--muted)]">verknüpft</div></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Kartenablauf-Vorschau</h3></div>
          <div className="p-4 grid grid-cols-3 gap-3 text-center">
            <div><div className="v text-[1.4rem] font-bold mono" style={{ color: "var(--bad)" }}>{r.cardExpiry.d30}</div><div className="text-[.72rem] text-[color:var(--muted)]">≤ 30 Tage</div></div>
            <div><div className="v text-[1.4rem] font-bold mono" style={{ color: "var(--warn)" }}>{r.cardExpiry.d60}</div><div className="text-[.72rem] text-[color:var(--muted)]">≤ 60 Tage</div></div>
            <div><div className="v text-[1.4rem] font-bold mono">{r.cardExpiry.d90}</div><div className="text-[.72rem] text-[color:var(--muted)]">≤ 90 Tage</div></div>
          </div>
        </div>
      </div>

      {/* Herkunft der Personen (aus Anträgen) */}
      <div className="panel mt-4">
        <div className="panel-h">
          <h3>Herkunft der Personen</h3>
          <form className="flex items-center gap-2">
            <select name="herkunft" defaultValue={herkunft ?? "all"} className="inp" style={{ width: 170 }}>
              <option value="all">Alle Herkünfte</option>
              <option value="GEMEINDE">nur Gemeinden</option>
              <option value="INSTITUTION">nur Institutionen</option>
            </select>
            <button className="btn sm" type="submit">Filtern</button>
          </form>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3 mb-2">
          <div className="card stat"><div className="k">von Gemeinden</div><div className="v">{originGemeinde}</div></div>
          <div className="card stat"><div className="k">von Institutionen</div><div className="v">{originInstitution}</div></div>
        </div>
        <div className="twrap"><table className="data">
          <thead><tr><th>Herkunftsstelle</th><th>Typ</th><th>Personen</th></tr></thead>
          <tbody>
            {origins.map((o) => (
              <tr key={o.org_name}><td>{o.org_name}</td>
                <td><span className={`pill ${o.org_type === "GEMEINDE" ? "tag-shop" : "tag-out"}`}>{o.org_type === "GEMEINDE" ? "Gemeinde" : "Institution"}</span></td>
                <td className="mono">{o.n}</td></tr>
            ))}
            {origins.length === 0 ? <tr><td colSpan={3}><div className="empty">Noch keine übernommenen Personen aus Anträgen.</div></td></tr> : null}
          </tbody>
        </table></div>
      </div>

      {/* Anträge je Monat nach Herkunft */}
      <div className="panel mt-4">
        <div className="panel-h"><h3>Anträge je Monat (Herkunft)</h3></div>
        <div className="twrap"><table className="data">
          <thead><tr><th>Monat</th><th>Gemeinden</th><th>Institutionen</th><th>Summe</th></tr></thead>
          <tbody>
            {r.antragMonthly.map((m) => (
              <tr key={m.month}><td className="mono">{m.month}</td><td className="mono">{m.gemeinde}</td><td className="mono">{m.institution}</td><td className="mono font-bold">{m.gemeinde + m.institution}</td></tr>
            ))}
            {r.antragMonthly.length === 0 ? <tr><td colSpan={4}><div className="empty">Noch keine Anträge erfasst.</div></td></tr> : null}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
