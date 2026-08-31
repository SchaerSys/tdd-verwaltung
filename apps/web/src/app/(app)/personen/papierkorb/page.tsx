import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ConfirmButton } from "@/components/ConfirmButton";
import { fmtDate } from "@/lib/format";
import { restorePerson, hardDeletePerson, emptyArchive } from "./actions";

interface Row {
  id: string; first_name: string; last_name: string; birth_date: string | null;
  deleted_at: string; delete_reason: string | null; retention_until: string | null;
  retention_ok: boolean; loc: string | null;
}

export default async function PersonenPapierkorbPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) redirect("/dashboard");
  const isAdmin = hasPermission(user.role, "admin:manage");

  const rows = (await db().execute(sql`
    SELECT p.id, p.first_name, p.last_name, to_char(p.birth_date,'YYYY-MM-DD') AS birth_date,
           to_char(p.deleted_at AT TIME ZONE 'Europe/Vienna', 'DD.MM.YYYY HH24:MI') AS deleted_at,
           p.delete_reason,
           to_char(p.retention_until, 'DD.MM.YYYY') AS retention_until,
           (p.retention_until IS NULL OR p.retention_until <= current_date) AS retention_ok,
           (SELECT l.name FROM person_location_assignments a JOIN locations l ON l.id = a.location_id
              WHERE a.person_id = p.id ORDER BY a.created_at DESC LIMIT 1) AS loc
    FROM persons p
    WHERE p.deleted_at IS NOT NULL
    ORDER BY p.deleted_at DESC
    LIMIT 500`)) as unknown as Row[];

  const total = rows.length;
  const purgeable = rows.filter((r) => r.retention_ok).length;

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Papierkorb – Personen</h1>
          <div className="sub">
            {total} archivierte {total === 1 ? "Person" : "Personen"} · endgültiges Löschen erst nach Ablauf der Aufbewahrungsfrist (3 Jahre)
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/personen" className="btn ghost">← Personen</Link>
          {isAdmin && purgeable > 0 ? (
            <form action={emptyArchive}>
              <ConfirmButton className="btn danger" message={`${purgeable} Person(en) mit abgelaufener Aufbewahrungsfrist endgültig löschen? Dies kann nicht rückgängig gemacht werden.`}>
                🗑 Frei gewordene endgültig löschen ({purgeable})
              </ConfirmButton>
            </form>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h3>Im Archiv</h3>
          <span className="pill muted">{total}</span>
        </div>
        {total === 0 ? (
          <div className="empty">Der Papierkorb ist leer.</div>
        ) : (
          <div className="twrap"><table className="data">
            <thead><tr>
              <th>Person</th><th>Geburtsdatum</th><th>Bezugsort</th><th>Archiviert</th>
              <th>Grund</th><th>Aufbewahrung</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.last_name}, {r.first_name}</b></td>
                  <td className="mono">{fmtDate(r.birth_date)}</td>
                  <td>{r.loc ?? "—"}</td>
                  <td className="mono">{r.deleted_at}</td>
                  <td className="text-[.8125rem]">{r.delete_reason ?? "—"}</td>
                  <td>
                    {r.retention_ok
                      ? <span className="pill good">Frist abgelaufen</span>
                      : <span className="pill warn" title="Aufbewahrungspflicht – endgültiges Löschen gesperrt">bis {r.retention_until}</span>}
                  </td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <form action={restorePerson}>
                        <input type="hidden" name="personId" value={r.id} />
                        <button className="btn ghost sm" type="submit">↩ Wiederherstellen</button>
                      </form>
                      {isAdmin && r.retention_ok ? (
                        <form action={hardDeletePerson}>
                          <input type="hidden" name="personId" value={r.id} />
                          <ConfirmButton className="btn danger sm" message={`„${r.first_name} ${r.last_name}" endgültig und unwiderruflich löschen?`}>Endgültig löschen</ConfirmButton>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
