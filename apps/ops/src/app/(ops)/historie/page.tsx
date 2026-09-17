import { hostDatei, letztesErgebnis } from "@/lib/host";
import { webStatus } from "@/lib/health";
import { dbFuer } from "@/lib/db";
import { opsAlarme } from "@tdd/db";
import { desc } from "drizzle-orm";
import { fmt } from "@/components/SupportTeile";

export const dynamic = "force-dynamic";

/** Deploy- und Migrationshistorie, laufende Versionen, Alarmzustand (Stufe B). */
export default async function HistorieSeite() {
  const [deploys, migrationen, migrationenAlt, web, alarme, alarmLauf] = await Promise.all([
    hostDatei("deploys.log", 40), hostDatei("migrations.log", 40), hostDatei("migrations.done", 200), webStatus(),
    dbFuer(null).select().from(opsAlarme).orderBy(desc(opsAlarme.aktiv), desc(opsAlarme.zuletztGeprueft)), letztesErgebnis("backup").then(() => hostDatei("ops/alarme.result", 1)).catch(() => [] as string[]),
  ]);
  const zeile = (z: string) => { const i = z.indexOf(" "); return { zeit: z.slice(0, i), rest: z.slice(i + 1) }; };
  const aktiv = alarme.filter((a) => a.aktiv);
  return (
    <div>
      <div className="page-h"><div><h1>Historie &amp; Alarme</h1><div className="sub">Was wann ausgerollt wurde · Migrationen · Zustand der Betreiber-Prüfungen</div></div></div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Alarme</h3>{aktiv.length ? <span className="pill bad">{aktiv.length} aktiv</span> : <span className="pill good">keine aktiven</span>}
          <span className="text-xs text-muted" style={{ marginLeft: 8 }}>alle 15 Min geprüft · Mail bei Zustandswechsel und als Erinnerung alle 24 h an die Super-Admins{process.env.ALARM_EMAIL ? ` (ALARM_EMAIL: ${process.env.ALARM_EMAIL})` : ""}</span></div>
        {alarme.length === 0 ? <div className="empty">Noch kein Prüflauf – Cron <code className="mono">alarm-cron.sh</code> eingerichtet?</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Prüfung</th><th>Zustand</th><th>Text</th><th>Seit</th><th>Zuletzt gemeldet</th><th>Zuletzt geprüft</th></tr></thead>
            <tbody>{alarme.map((a) => (
              <tr key={a.schluessel}><td className="mono text-xs">{a.schluessel}</td><td>{a.aktiv ? <span className="pill bad">ALARM</span> : <span className="pill good">ok</span>}</td><td className="text-sm">{a.text}</td><td className="text-xs">{fmt(a.seit)}</td><td className="text-xs">{fmt(a.zuletztGemeldet)}</td><td className="text-xs">{fmt(a.zuletztGeprueft)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        {alarmLauf[0] ? <div className="text-xs text-muted p-2 mono" style={{ whiteSpace: "pre-wrap" }}>{alarmLauf[0].slice(0, 300)}</div> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel">
          <div className="panel-h"><h3>Deploys</h3><span className="text-xs text-muted" style={{ marginLeft: 8 }}>läuft: Fach-App {web.version ?? "?"} · Wartung {process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}</span></div>
          {deploys.length === 0 ? <div className="empty">Noch keine Einträge (ab Deploy 75 geschrieben).</div> : (
            <div className="twrap"><table className="data"><thead><tr><th>Zeit</th><th>Stand (Commit)</th></tr></thead>
              <tbody>{[...deploys].reverse().map((z, i) => { const { zeit, rest } = zeile(z); return <tr key={i}><td className="mono text-xs">{zeit}</td><td className="mono text-xs">{rest}</td></tr>; })}</tbody></table></div>
          )}
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Migrationen</h3><span className="pill muted">{migrationenAlt.length} eingespielt</span></div>
          <div className="twrap"><table className="data"><thead><tr><th>Zeit</th><th>Migration</th></tr></thead>
            <tbody>
              {[...migrationen].reverse().map((z, i) => { const { zeit, rest } = zeile(z); return <tr key={`n${i}`}><td className="mono text-xs">{zeit}</td><td className="mono text-xs">{rest}</td></tr>; })}
              {[...migrationenAlt].reverse().filter((m) => !migrationen.some((z) => z.endsWith(" " + m))).slice(0, 15).map((m, i) => <tr key={`a${i}`}><td className="mono text-xs text-muted">vor Historie</td><td className="mono text-xs">{m}</td></tr>)}
            </tbody></table></div>
        </div>
      </div>
    </div>
  );
}
