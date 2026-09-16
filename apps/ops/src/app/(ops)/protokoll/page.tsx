import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { hostDatei } from "@/lib/host";

export const dynamic = "force-dynamic";

function rows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[];
}
const fmt = (d: Date | string) => new Date(d).toLocaleString("de-AT", { timeZone: "Europe/Vienna", dateStyle: "short", timeStyle: "short" });

/**
 * Protokoll ohne Personenbezug: Aktionen je Tag, Anmeldeversuche, letzte Ereignisse
 * (Aktion + Rolle des Akteurs, kein Datensatz-Bezug) und das Backup-Log.
 */
export default async function ProtokollSeite() {
  const d = await db();
  const [taeglichRoh, loginsRoh, letzteRoh, backupLog] = await Promise.all([
    d.execute(sql`SELECT tag::text AS tag, action, entity_type, n FROM v_audit_daily WHERE tag >= current_date - 14 ORDER BY tag DESC, n DESC`),
    d.execute(sql`SELECT tag::text AS tag, ok, fehl, gesperrt, zweiter_faktor_fehl FROM v_login_daily WHERE tag >= current_date - 30 ORDER BY tag DESC`),
    d.execute(sql`SELECT at, action, entity_type, akteur, akteur_rolle FROM v_audit_recent LIMIT 200`),
    hostDatei("backup.log", 40),
  ]);
  const taeglich = rows<{ tag: string; action: string; entity_type: string; n: number }>(taeglichRoh);
  const logins = rows<{ tag: string; ok: number; fehl: number; gesperrt: number; zweiter_faktor_fehl: number }>(loginsRoh);
  const letzte = rows<{ at: string; action: string; entity_type: string; akteur: string | null; akteur_rolle: string | null }>(letzteRoh);
  const tage = [...new Set(taeglich.map((t) => t.tag))];
  const verdaechtig = logins.filter((l) => Number(l.fehl) >= 10 || Number(l.gesperrt) > 0);

  return (
    <div>
      <div className="page-h"><div><h1>Protokoll</h1><div className="sub">Audit-Zusammenfassung ohne Personenbezug · Backup-Log</div></div></div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Anmeldungen (30 Tage)</h3>{verdaechtig.length ? <span className="pill warn">{verdaechtig.length} auffällige Tage</span> : <span className="pill good"><span className="dot" />unauffällig</span>}</div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Tag</th><th className="text-right">erfolgreich</th><th className="text-right">fehlgeschlagen</th><th className="text-right">Sperren</th><th className="text-right">2FA-Fehler</th></tr></thead>
            <tbody>{logins.map((l) => (
              <tr key={l.tag} style={Number(l.fehl) >= 10 || Number(l.gesperrt) > 0 ? { background: "var(--warn-bg)" } : undefined}>
                <td className="mono">{l.tag}</td><td className="mono text-right">{l.ok}</td><td className="mono text-right">{l.fehl}</td><td className="mono text-right">{l.gesperrt}</td><td className="mono text-right">{l.zweiter_faktor_fehl}</td>
              </tr>
            ))}
            {logins.length === 0 ? <tr><td colSpan={5}><div className="empty">Keine Anmeldungen protokolliert.</div></td></tr> : null}
            </tbody>
          </table></div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Aktionen je Tag (14 Tage)</h3></div>
          <div className="p-3 flex flex-col gap-2 text-[.8125rem]" style={{ maxHeight: 420, overflow: "auto" }}>
            {tage.map((tag) => (
              <div key={tag}>
                <div className="mono text-xs text-muted">{tag}</div>
                <div className="flex gap-1 flex-wrap">
                  {taeglich.filter((t) => t.tag === tag).map((t) => <span key={t.action + t.entity_type} className="pill muted" title={t.entity_type}>{t.action} <b>{t.n}</b></span>)}
                </div>
              </div>
            ))}
            {tage.length === 0 ? <div className="empty">Nichts protokolliert.</div> : null}
          </div>
        </div>
      </div>

      <div className="panel mt-4">
        <div className="panel-h"><h3>Letzte Ereignisse</h3><span className="pill muted">{letzte.length}</span><span className="text-xs text-muted" style={{ marginLeft: 8 }}>Ohne Datensatz-Bezug – wer was getan hat, aber nicht an wem.</span></div>
        <div className="twrap" style={{ maxHeight: 480, overflow: "auto" }}><table className="data">
          <thead><tr><th>Zeit</th><th>Aktion</th><th>Objekt</th><th>Akteur</th></tr></thead>
          <tbody>{letzte.map((e, i) => (
            <tr key={i}><td className="mono text-xs">{fmt(e.at)}</td><td className="mono">{e.action}</td><td className="text-muted">{e.entity_type}</td><td>{e.akteur ?? (e.action.startsWith("ops.") ? "Wartung" : "System")}{e.akteur_rolle ? <span className="text-xs text-muted"> · {e.akteur_rolle}</span> : null}</td></tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="panel mt-4">
        <div className="panel-h"><h3>Backup-Log</h3></div>
        <pre className="p-4 text-xs mono" style={{ maxHeight: 300, overflow: "auto" }}>{backupLog.join("\n") || "Kein Backup-Log lesbar."}</pre>
      </div>
    </div>
  );
}
