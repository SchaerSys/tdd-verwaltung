import { kennzahlen } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Nur Zahlen – aus den PII-freien Views. Namen von Menschen kommen hier nie an. */
export default async function KennzahlenSeite() {
  const k = await kennzahlen();
  const max = Math.max(1, ...k.ausgabenTage.map((t) => t.n));
  const monate = [...new Set(k.antraegeMonate.map((m) => m.monat))].sort().reverse().slice(0, 12);

  return (
    <div>
      <div className="page-h"><div><h1>Kennzahlen</h1><div className="sub">Aggregate aus v_system_counts, v_stats_by_location, v_distributions_daily, v_antraege_by_origin_month</div></div></div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Zahl label="Personen (aktiv)" v={k.system.persons_total} />
        <Zahl label="Aktive Karten" v={k.system.active_cards} />
        <Zahl label="Ausgaben (30 Tage)" v={k.system.distributions_30d} />
        <Zahl label="Aktive Benutzer" v={k.system.active_users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Standorte</h3><span className="pill muted">{k.standorte.length}</span></div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Standort</th><th>Typ</th><th className="text-right">Personen</th><th className="text-right">Karten</th><th className="text-right">Ausgaben 30 T</th></tr></thead>
            <tbody>{k.standorte.map((s) => (
              <tr key={s.location_id} style={s.is_active ? undefined : { opacity: .5 }}>
                <td>{s.name}{!s.is_active ? <span className="pill muted" style={{ marginLeft: 6 }}>inaktiv</span> : null}</td>
                <td><span className={`pill ${s.type === "LADEN" ? "tag-shop" : "tag-out"}`}>{s.type === "LADEN" ? "Laden" : "Ausgabestelle"}</span></td>
                <td className="mono text-right">{s.persons}</td><td className="mono text-right">{s.active_cards}</td><td className="mono text-right">{s.distributions_30d}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Ausgaben je Tag (30 Tage)</h3></div>
          <div className="p-4">
            {k.ausgabenTage.length === 0 ? <div className="empty">Keine Ausgaben in den letzten 30 Tagen.</div> : (
              <div className="flex items-end gap-[2px]" style={{ height: 120 }}>
                {k.ausgabenTage.map((t) => (
                  <div key={t.day} className="flex-1" title={`${t.day}: ${t.n}`} style={{ height: `${(t.n / max) * 100}%`, background: "var(--accent)", borderRadius: 2, minHeight: 2 }} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Anträge je Monat (Portal)</h3></div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Monat</th><th className="text-right">Gemeinden</th><th className="text-right">Institutionen</th></tr></thead>
            <tbody>{monate.map((m) => (
              <tr key={m}><td className="mono">{m}</td>
                <td className="mono text-right">{k.antraegeMonate.find((x) => x.monat === m && x.org_type === "GEMEINDE")?.n ?? 0}</td>
                <td className="mono text-right">{k.antraegeMonate.find((x) => x.monat === m && x.org_type === "INSTITUTION")?.n ?? 0}</td></tr>
            ))}
            {monate.length === 0 ? <tr><td colSpan={3}><div className="empty">Noch keine Anträge.</div></td></tr> : null}
            </tbody>
          </table></div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Organisationen</h3></div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Typ</th><th className="text-right">gesamt</th><th className="text-right">aktiv</th></tr></thead>
            <tbody>{k.organisationen.map((o) => <tr key={o.type}><td>{o.type}</td><td className="mono text-right">{o.n}</td><td className="mono text-right">{o.aktiv}</td></tr>)}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

function Zahl({ label, v }: { label: string; v: number }) {
  return <div className="panel p-4"><div className="text-[1.5rem] font-bold mono">{v.toLocaleString("de-AT")}</div><div className="text-[.75rem] text-muted">{label}</div></div>;
}
