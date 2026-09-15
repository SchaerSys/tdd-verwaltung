import Link from "next/link";
import { dbStatus, webStatus, zertStatus } from "@/lib/health";
import { hostDatei, platte, wartungsmodus, letztesErgebnis } from "@/lib/host";
import { backupBewertung } from "@/lib/backup-log";

export const dynamic = "force-dynamic";

const fmtDt = (d: Date | null | undefined) => (d ? d.toLocaleString("de-AT", { timeZone: "Europe/Vienna" }) : "—");

/** Systemstatus: Fach-App, Datenbank, Zertifikat, Platte, Backup, Migrationen. */
export default async function StatusSeite() {
  const host = process.env.APP_DOMAIN ?? "tdd.schaer-systems.at";
  const [web, dbInfo, zert, disk, backupLog, migrationen, wartung, backupErgebnis] = await Promise.all([
    webStatus(), dbStatus().catch((e: Error) => e), zertStatus(host), platte(), hostDatei("backup.log", 5), hostDatei("migrations.done", 3), wartungsmodus(), letztesErgebnis("backup"),
  ]);
  const dbFehler = dbInfo instanceof Error ? dbInfo.message : null;
  const dbi = dbInfo instanceof Error ? null : dbInfo;
  const backup = backupBewertung(backupLog, new Date());
  const backupOk = backup.eintrag?.ok ?? false;
  const backupAlt = backup.veraltet;
  const laufzeit = dbi ? Math.floor((Date.now() - dbi.gestartet.getTime()) / 36e5) : null;

  const ampel = (ok: boolean, warn = false) => <span className={`pill ${ok ? (warn ? "warn" : "good") : "bad"}`}><span className="dot" />{ok ? (warn ? "Hinweis" : "ok") : "Störung"}</span>;

  return (
    <div>
      <div className="page-h">
        <div><h1>Systemstatus</h1><div className="sub">{host} · Stand {fmtDt(new Date())}</div></div>
        <Link href="/wartung" className="btn ghost">Wartung →</Link>
      </div>

      {wartung ? <div className="panel mb-4" style={{ borderColor: "var(--bad)" }}><div className="p-4 text-[.8125rem]"><b>Wartungsmodus ist aktiv</b> – die Fach-App zeigt Besucher:innen eine Hinweisseite. <Link href="/wartung">Beenden →</Link></div></div> : null}

      <div className="grid gap-4 md:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Fach-App</h3>{ampel(web.ok)}</div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-1">
            <Z l="Erreichbar (intern)" v={web.erreichbar ? "ja" : `nein – ${web.fehler ?? ""}`} />
            <Z l="Version (Build)" v={web.version ?? "—"} />
            <Z l="DB-Antwort" v={web.dbMs != null ? `${web.dbMs} ms` : "—"} />
            <Z l="Zertifikat" v={zert.gueltigBis ? `gültig bis ${fmtDt(zert.gueltigBis)} (${zert.tage} Tage)` : `nicht prüfbar – ${zert.fehler ?? ""}`} warn={zert.tage != null && zert.tage < 14} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Datenbank</h3>{ampel(!dbFehler)}</div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-1">
            {dbFehler ? <div className="text-[color:var(--bad)]">{dbFehler}</div> : null}
            {dbi ? <>
              <Z l="Version" v={dbi.version} />
              <Z l="Läuft seit" v={`${fmtDt(dbi.gestartet)} (${laufzeit} h)`} />
              <Z l="Größe" v={`${dbi.groesseMb} MB`} />
              <Z l="Verbindungen" v={`${dbi.verbindungen} von ${dbi.maxVerbindungen}`} warn={dbi.verbindungen > dbi.maxVerbindungen * 0.8} />
            </> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Backup (verschlüsselt, Storage Box)</h3>{ampel(backupOk && !backupAlt, backupOk && backupAlt)}</div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-1">
            {backupLog.length ? backupLog.map((z, i) => <div key={i} className="mono text-xs">{z}</div>) : <div className="text-muted">Kein Backup-Log lesbar.</div>}
            {backupAlt ? <div className="text-[color:var(--warn)] mt-1">Letztes Backup liegt länger als 30 Stunden zurück.</div> : null}
            {backupErgebnis ? <div className="text-xs text-muted mt-1">Letzte manuelle Sicherung: <span className="mono">{backupErgebnis.split("\n")[0]}</span></div> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Server</h3>{ampel(!!disk && disk.belegtProzent < 85, !!disk && disk.belegtProzent >= 70)}</div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-1">
            <Z l="Platte (/opt/tdd)" v={disk ? `${disk.freiGb} GB frei von ${disk.gesamtGb} GB (${disk.belegtProzent} % belegt)` : "nicht lesbar"} warn={!!disk && disk.belegtProzent >= 70} />
            <Z l="Letzte Migrationen" v={migrationen.join(" · ") || "—"} />
            <Z l="Wartung (Build)" v={process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"} />
          </div>
        </div>
      </div>

      {dbi ? (
        <div className="panel mt-4">
          <div className="panel-h"><h3>Tabellen</h3><span className="pill muted">{dbi.tabellen.length}</span></div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Tabelle</th><th className="text-right">Zeilen (geschätzt)</th><th className="text-right">Größe</th></tr></thead>
            <tbody>{dbi.tabellen.map((t) => <tr key={t.name}><td className="mono">{t.name}</td><td className="mono text-right">{t.zeilen.toLocaleString("de-AT")}</td><td className="mono text-right">{t.mb} MB</td></tr>)}</tbody>
          </table></div>
        </div>
      ) : null}
    </div>
  );
}

function Z({ l, v, warn }: { l: string; v: string; warn?: boolean }) {
  return <div className="flex gap-2"><span className="text-muted" style={{ minWidth: 150 }}>{l}:</span><span style={warn ? { color: "var(--warn)" } : undefined}>{v}</span></div>;
}
