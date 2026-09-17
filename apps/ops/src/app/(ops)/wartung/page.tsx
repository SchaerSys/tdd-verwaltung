import { anfrageOffen, hostDatei, letztesErgebnis, wartungsmodus } from "@/lib/host";
import { webStatus } from "@/lib/health";
import { backupJetzt, neustartFachApp, rueckspielprobe, wartungsmodus as wartungsmodusAction } from "./actions";

export const dynamic = "force-dynamic";

/** Betriebsaktionen ueber den Host-Agenten (Dateien in /opt/tdd/ops) – keine Docker-Rechte im Container. */
export default async function WartungSeite() {
  const [wartung, backupOffen, restartOffen, backupErgebnis, restartErgebnis, migrationen, web, probeOffen, probeErgebnis] = await Promise.all([
    wartungsmodus(), anfrageOffen("backup"), anfrageOffen("restart"), letztesErgebnis("backup"), letztesErgebnis("restart"), hostDatei("migrations.done", 8), webStatus(),
    anfrageOffen("restoretest"), letztesErgebnis("restoretest"),
  ]);

  return (
    <div>
      <div className="page-h"><div><h1>Wartung</h1><div className="sub">Backup, Neustart, Wartungsmodus, Updates</div></div></div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel" style={wartung ? { borderColor: "var(--bad)" } : undefined}>
          <div className="panel-h"><h3>Wartungsmodus</h3>{wartung ? <span className="pill bad"><span className="dot" />aktiv</span> : <span className="pill good"><span className="dot" />aus</span>}</div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-3">
            <p>Im Wartungsmodus zeigt die Fach-App unter {process.env.APP_DOMAIN ?? "tdd.schaer-systems.at"} allen Besucher:innen eine Hinweisseite (HTTP 503). Die App selbst läuft weiter; nächtliche Jobs und diese Plattform sind nicht betroffen. Für Migrationen mit Datenumbau oder Wiederherstellung aus dem Backup.</p>
            <form action={wartungsmodusAction}>
              <input type="hidden" name="an" value={wartung ? "0" : "1"} />
              <button className={`btn ${wartung ? "primary" : "danger"}`} type="submit">{wartung ? "Wartungsmodus beenden" : "Wartungsmodus einschalten"}</button>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Backup jetzt</h3>{backupOffen ? <span className="pill warn">angefordert, läuft gleich</span> : null}</div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-3">
            <p>Verschlüsselte Sicherung (Datenbank, Uploads, Konfiguration) sofort auf die Storage Box – zusätzlich zur nächtlichen um 03:00. Der Host-Agent greift die Anfrage innerhalb einer Minute auf.</p>
            <form action={backupJetzt}><button className="btn primary" type="submit" disabled={backupOffen}>Backup jetzt anstoßen</button></form>
            {backupErgebnis ? <pre className="text-xs mono p-2 border border-[color:var(--border)] rounded" style={{ whiteSpace: "pre-wrap" }}>{backupErgebnis}</pre> : <div className="text-xs text-muted">Noch keine manuelle Sicherung ausgelöst.</div>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Fach-App neu starten</h3>{restartOffen ? <span className="pill warn">angefordert</span> : web.ok ? <span className="pill good"><span className="dot" />läuft</span> : <span className="pill bad">nicht erreichbar</span>}</div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-3">
            <p>Startet den Container der Fach-App neu (ca. 20 Sekunden Unterbrechung). Nötig nach geänderten Umgebungsvariablen oder wenn die App hängt. Version derzeit: <span className="mono">{web.version ?? "—"}</span></p>
            <form action={neustartFachApp}><button className="btn danger" type="submit" disabled={restartOffen}>Neustart anfordern</button></form>
            {restartErgebnis ? <pre className="text-xs mono p-2 border border-[color:var(--border)] rounded" style={{ whiteSpace: "pre-wrap" }}>{restartErgebnis}</pre> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Rückspielprobe</h3>{probeOffen ? <span className="pill warn">läuft</span> : probeErgebnis?.includes("\nOK") ? <span className="pill good">letzte ok</span> : probeErgebnis ? <span className="pill bad">letzte fehlgeschlagen</span> : null}</div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-3">
            <p>Nimmt jetzt einen Dump der Produktionsdatenbank, spielt ihn in eine Wegwerf-Datenbank ein, zählt Mandanten/Personen/Karten/Ausgaben/Personal/Benutzer gegen die Produktion und räumt auf (ca. 1 Minute, keine Unterbrechung). Prüft die Dump/Restore-Mechanik und das Schema. Die verschlüsselten Archive auf der Storage Box prüft <code className="mono">scripts/restore-test.sh</code> vom Betreiber-PC – alle drei Monate.</p>
            <form action={rueckspielprobe}><button className="btn" type="submit" disabled={probeOffen}>Rückspielprobe starten</button></form>
            {probeErgebnis ? <pre className="text-xs mono p-2 border border-[color:var(--border)] rounded" style={{ whiteSpace: "pre-wrap" }}>{probeErgebnis}</pre> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Updates</h3></div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-2">
            <p>Ein Update wird vom Betreiber-Rechner mit <code className="mono">bash scripts/deploy.sh</code> eingespielt: Integrationstests auf dem Server, Image-Build mit Typecheck/Lint/Unit-Tests, nur neue Migrationen, Container-Tausch, Nachweis. Kein Code aus fremden CI-Diensten.</p>
            <div className="text-xs text-muted">Eingespielte Migrationen (letzte):</div>
            <div className="flex gap-1 flex-wrap">{migrationen.map((m) => <span key={m} className="pill muted mono">{m}</span>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
