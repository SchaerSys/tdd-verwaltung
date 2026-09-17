import Link from "next/link";
import { mandantenStatus } from "@/lib/unternehmen";
import { gewaehlterMandant } from "@/lib/tenant";
import { mandantSchalten } from "./actions";
import { NeuerMandant } from "./NeuerMandant";
import { fmt } from "@/components/SupportTeile";
import { checkliste } from "./checkliste";

export const dynamic = "force-dynamic";

/** Mandanten (Unternehmen): globale Ebene ueber den Organisationen (053/054/055). */
export default async function UnternehmenSeite() {
  const [mandanten, gewaehlt] = await Promise.all([mandantenStatus(), gewaehlterMandant()]);
  return (
    <div>
      <div className="page-h"><div><h1>Mandanten (Unternehmen)</h1><div className="sub">Jedes Unternehmen hat eigene Daten, Benutzer und Regeln – strikt getrennt in der Datenbank</div></div></div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Unternehmen</h3><span className="pill muted">{mandanten.length}</span></div>
        <div className="twrap"><table className="data">
          <thead><tr><th>Name</th><th>Kurzname</th><th>Host</th><th>Inbetriebnahme</th><th>Benutzer</th><th>Personen</th><th>Letzter Login</th><th>Status</th><th></th></tr></thead>
          <tbody>{mandanten.map((m) => {
            const offen = checkliste(m).filter((p) => !p.ok).length;
            return (
              <tr key={m.id}>
                <td><Link href={`/unternehmen/${m.id}`}>{m.name}</Link>{m.id === gewaehlt ? <span className="pill good" style={{ marginLeft: 8 }}>gewählt</span> : null}</td>
                <td className="mono">{m.slug}</td>
                <td className="mono text-xs">{m.host ?? <span className="text-muted">— (Anmeldung über E-Mail)</span>}</td>
                <td>{offen === 0 ? <span className="pill good">vollständig</span> : <span className="pill warn">{offen} offen</span>}</td>
                <td>{m.benutzer} <span className="text-muted text-xs">({m.admins} Admin)</span></td>
                <td>{m.personen}</td>
                <td>{fmt(m.letzter_login)}</td>
                <td>{m.is_active ? <span className="pill good"><span className="dot" />aktiv</span> : <span className="pill muted">inaktiv</span>}</td>
                <td>
                  <form action={mandantSchalten}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="aktiv" value={m.is_active ? "0" : "1"} />
                    <button className="btn ghost sm" type="submit">{m.is_active ? "Deaktivieren" : "Aktivieren"}</button>
                  </form>
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <p className="text-xs text-muted" style={{ padding: "8px 12px" }}>
          Deaktivieren sperrt Logins und nimmt den Mandanten aus den Hintergrundjobs. Löschen gibt es bewusst nicht – ein Mandant mit Bestand bleibt.
        </p>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Neues Unternehmen anlegen</h3></div>
        <div style={{ padding: 12 }}>
          <p className="text-sm text-muted mb-3">
            Angelegt werden: der Mandant, seine Trägerorganisation, Zeitregeln (AZG-Standard), Löschfristen und Auswahllisten als Kopie von Tischlein deck dich Vorarlberg.
            Danach die Inbetriebnahme-Liste des Mandanten abarbeiten (Stammdaten, erstes Admin-Konto, Standorte).
          </p>
          <NeuerMandant />
        </div>
      </div>
    </div>
  );
}
