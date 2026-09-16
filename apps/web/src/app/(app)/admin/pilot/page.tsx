import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function rows<T>(res: unknown): T[] { return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[]; }

interface OrtZeile {
  id: number; name: string; type: string; personen: number; mit_karte: number; legacy: number; ean: number; ohne_karte: number;
  geb: number; kollisionen: number; price_adult: string; price_child: string; oeffnung: boolean; kasse_user: number; koord: boolean;
  ausgaben_30d: number;
}

/**
 * Pilot am Tresen: Ist eine Ausgabestelle bereit, im neuen System zu arbeiten?
 * Zahlen je Standort + die Handgriffe, die vorher erledigt sein muessen.
 */
export default async function PilotSeite() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) redirect("/dashboard");
  const d = db();
  const orte = rows<OrtZeile>(await d.execute(sql`
    SELECT l.id, l.name, l.type, l.price_adult, l.price_child, (l.opening_hours IS NOT NULL) AS oeffnung, (l.lat IS NOT NULL) AS koord,
      (SELECT count(*) FROM person_location_assignments a JOIN persons p ON p.id = a.person_id WHERE a.location_id = l.id AND a.is_active AND p.deleted_at IS NULL)::int AS personen,
      (SELECT count(DISTINCT p.id) FROM person_location_assignments a JOIN persons p ON p.id = a.person_id JOIN cards c ON c.person_id = p.id AND c.deleted_at IS NULL WHERE a.location_id = l.id AND a.is_active AND p.deleted_at IS NULL)::int AS mit_karte,
      (SELECT count(*) FROM cards c WHERE c.location_id = l.id AND c.deleted_at IS NULL AND c.legacy AND c.status IN ('AKTIV','GESPERRT'))::int AS legacy,
      (SELECT count(*) FROM cards c WHERE c.location_id = l.id AND c.deleted_at IS NULL AND NOT c.legacy AND c.status = 'AKTIV')::int AS ean,
      (SELECT count(*) FROM person_location_assignments a JOIN persons p ON p.id = a.person_id WHERE a.location_id = l.id AND a.is_active AND p.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.person_id = p.id AND c.deleted_at IS NULL))::int AS ohne_karte,
      (SELECT count(*) FROM person_location_assignments a JOIN persons p ON p.id = a.person_id WHERE a.location_id = l.id AND a.is_active AND p.deleted_at IS NULL AND p.birth_date IS NOT NULL)::int AS geb,
      (SELECT count(*) FROM (SELECT p.gruppe, p.ausgabe_number FROM person_location_assignments a JOIN persons p ON p.id = a.person_id WHERE a.location_id = l.id AND a.is_active AND p.deleted_at IS NULL AND p.gruppe IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) k)::int AS kollisionen,
      (SELECT count(*) FROM users u WHERE u.location_id = l.id AND u.is_active AND u.role IN ('AUSGABE','ERFASSUNG','ADMIN'))::int AS kasse_user,
      (SELECT count(*) FROM distributions x WHERE x.location_id = l.id AND x.distributed_at > now() - interval '30 days' AND coalesce(x.note,'') <> 'Übernahme Altsystem')::int AS ausgaben_30d
    FROM locations l WHERE l.is_active AND l.type = 'AUSGABESTELLE' ORDER BY l.name`));
  const letzterImport = rows<{ at: Date; after: unknown }>(await d.execute(sql`SELECT at, after FROM audit_logs WHERE action = 'migration.familien' ORDER BY at DESC LIMIT 1`))[0];
  const smtp = !!process.env.SMTP_HOST;
  const osrm = !!process.env.OSRM_URL;

  const Ampel = ({ ok, warn }: { ok: boolean; warn?: boolean }) => <span className={`pill ${ok ? "good" : warn ? "warn" : "bad"}`}><span className="dot" />{ok ? "ok" : warn ? "prüfen" : "fehlt"}</span>;

  return (
    <div>
      <div className="page-h">
        <div><h1>Pilot am Tresen</h1><div className="sub">Bereitschaft je Ausgabestelle · letzter Abgleich mit dem Altsystem: {letzterImport ? fmtDateTime(letzterImport.at) : "noch nie"}</div></div>
        <div className="flex gap-2"><Link href="/admin/migration" className="btn">Altsystem abgleichen</Link><Link href="/admin" className="btn ghost">← Stammdaten</Link></div>
      </div>

      <div className="panel mb-4">
        <div className="twrap"><table className="data">
          <thead><tr><th>Ausgabestelle</th><th className="text-right">Personen</th><th className="text-right">mit Karte</th><th className="text-right">ohne Karte</th><th className="text-right">Alt / EAN</th><th className="text-right">Geburtsdatum</th><th className="text-right">Nr.-Kollisionen</th><th>Preise</th><th>Öffnungszeiten</th><th>Kassen-Login</th><th>Karte</th><th className="text-right">Ausgaben 30 T</th></tr></thead>
          <tbody>{orte.map((o) => {
            const quote = o.personen ? Math.round((o.mit_karte / o.personen) * 100) : 0;
            return (
              <tr key={o.id}>
                <td><b>{o.name}</b></td>
                <td className="mono text-right">{o.personen}</td>
                <td className="mono text-right">{o.mit_karte} <span className="text-muted text-xs">({quote} %)</span></td>
                <td className="mono text-right">{o.ohne_karte ? <span className="pill warn">{o.ohne_karte}</span> : "0"}</td>
                <td className="mono text-right">{o.legacy} / {o.ean}</td>
                <td className="mono text-right">{o.geb}</td>
                <td className="mono text-right">{o.kollisionen ? <span className="pill bad">{o.kollisionen}</span> : "0"}</td>
                <td><Ampel ok={Number(o.price_adult) > 0} warn /> <span className="text-xs mono">{o.price_adult} / {o.price_child} €</span></td>
                <td><Ampel ok={o.oeffnung} warn /></td>
                <td><Ampel ok={o.kasse_user > 0} /> <span className="text-xs">{o.kasse_user}</span></td>
                <td><Ampel ok={o.koord} warn /></td>
                <td className="mono text-right">{o.ausgaben_30d}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <div className="p-3 text-[.72rem] text-muted">„ohne Karte“ = Personen, die am Tresen nicht scannbar sind (weder Alt-Barcode noch EAN) – der Abgleich mit dem Altsystem legt die Alt-Karten nach. Nr.-Kollisionen: zwei Familien mit derselben Gruppe/Nummer am Ort.</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>System</h3></div>
          <ul className="p-4 flex flex-col gap-2 text-[.8125rem]">
            <li className="flex gap-2 items-center"><Ampel ok={smtp} /> E-Mail-Versand (Erinnerungen, Passwort-Reset)</li>
            <li className="flex gap-2 items-center"><Ampel ok={osrm} warn /> Routing-Dienst (nur für Touren)</li>
            <li className="flex gap-2 items-center"><Ampel ok={!!letzterImport} /> Abgleich mit dem Altsystem {letzterImport ? `zuletzt ${fmtDateTime(letzterImport.at)}` : "– noch nie ausgeführt"}</li>
            <li className="flex gap-2 items-center"><span className="pill muted">manuell</span> Backup läuft nächtlich verschlüsselt (Wartungsplattform → Status)</li>
            <li className="flex gap-2 items-center"><span className="pill muted">manuell</span> Kartendrucker Zebra ZC350: Testdruck über eine Person → „Karte drucken“</li>
          </ul>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Ablauf für den Pilot-Standort</h3></div>
          <ol className="p-4 flex flex-col gap-2 text-[.8125rem] list-decimal pl-8">
            <li><b>Altsystem abgleichen</b> (Export der Familien → Import, Modus „Altsystem ist führend“) am Vorabend des Starts, damit Stand, Sperren und Schulden aktuell sind und alle Alt-Karten scannbar werden.</li>
            <li><b>Stammdaten prüfen</b>: Preise, Öffnungszeiten, Gruppen/Nummern-Kollisionen bereinigen (Personen → Gruppe/Nummer).</li>
            <li><b>Kassen-Login</b> für den Standort anlegen (Rolle AUSGABE, Standort gesetzt), 2FA am Tablet nicht nötig.</li>
            <li><b>Tablet einrichten</b>: Chrome, <code className="mono">tdd.schaer-systems.at/kiosk</code> als App installieren, Kamera-Zugriff erlauben (Barcode-Scan ohne Lesegerät) – oder USB-Scanner anstecken. Offline-Betrieb: Karten werden zwischengespeichert, Ausgaben nachgebucht.</li>
            <li><b>Am Tresen</b>: Alt-Karte scannen → Ampel → bei Erstkontakt <b>Geburtsdatum erfragen</b> (Feld erscheint automatisch) → neue EAN-Karte wird erzeugt und gedruckt → Ausgabe bestätigen, Geld erfassen.</li>
            <li><b>Ab Pilotstart</b> keine Änderungen dieses Standorts mehr im Altsystem; spätere Abgleiche nur im Modus „Ergänzen“.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
