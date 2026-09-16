import { mandantenListe } from "@/lib/unternehmen";
import { gewaehlterMandant } from "@/lib/tenant";
import { mandantSchalten } from "./actions";
import { NeuerMandant } from "./NeuerMandant";
import { fmt } from "@/components/SupportTeile";

export const dynamic = "force-dynamic";

/** Mandanten (Unternehmen): globale Ebene ueber den Organisationen (053/054). */
export default async function UnternehmenSeite() {
  const [mandanten, gewaehlt] = await Promise.all([mandantenListe(), gewaehlterMandant()]);
  return (
    <div>
      <div className="page-h"><div><h1>Mandanten (Unternehmen)</h1><div className="sub">Jedes Unternehmen hat eigene Daten, Benutzer und Regeln – strikt getrennt in der Datenbank</div></div></div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Unternehmen</h3><span className="pill muted">{mandanten.length}</span></div>
        <div className="twrap"><table className="data">
          <thead><tr><th>Name</th><th>Kurzname</th><th>Kennung</th><th>Angelegt</th><th>Status</th><th></th></tr></thead>
          <tbody>{mandanten.map((m) => (
            <tr key={m.id}>
              <td>{m.name}{m.id === gewaehlt ? <span className="pill good" style={{ marginLeft: 8 }}>gewählt</span> : null}</td>
              <td className="mono">{m.slug}</td>
              <td className="mono text-xs">{m.id}</td>
              <td>{fmt(m.createdAt)}</td>
              <td>{m.isActive ? <span className="pill good"><span className="dot" />aktiv</span> : <span className="pill muted">inaktiv</span>}</td>
              <td>
                <form action={mandantSchalten}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="aktiv" value={m.isActive ? "0" : "1"} />
                  <button className="btn ghost sm" type="submit">{m.isActive ? "Deaktivieren" : "Aktivieren"}</button>
                </form>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="text-xs text-muted" style={{ padding: "8px 12px" }}>
          Deaktivieren sperrt keine Logins, sondern nimmt den Mandanten aus den Hintergrundjobs (Löschfristen, Ablauf, Bereinigung). Löschen gibt es bewusst nicht – ein Mandant mit Bestand bleibt.
        </p>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Neues Unternehmen anlegen</h3></div>
        <div style={{ padding: 12 }}>
          <p className="text-sm text-muted mb-3">
            Angelegt werden: der Mandant, seine Trägerorganisation, Zeitregeln (AZG-Standard), Löschfristen und Auswahllisten als Kopie von Tischlein deck dich Vorarlberg.
            Danach oben den Mandanten wählen und unter „Benutzer“ das erste Admin-Konto einladen. Standorte legt der Admin in der Fach-App an.
          </p>
          <NeuerMandant />
        </div>
      </div>
    </div>
  );
}
