import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { persons, personLocationAssignments, locations, organizations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { takeoverPerson } from "./actions";

export default async function BewilligtPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) redirect("/dashboard");

  const rows = await db()
    .select({
      id: persons.id, first: persons.firstName, last: persons.lastName, birth: persons.birthDate,
      createdAt: persons.createdAt, locName: locations.name, locType: locations.type,
      orgName: organizations.name, orgType: organizations.type,
    })
    .from(persons)
    .leftJoin(personLocationAssignments, and(eq(personLocationAssignments.personId, persons.id), eq(personLocationAssignments.isActive, true)))
    .leftJoin(locations, eq(personLocationAssignments.locationId, locations.id))
    .leftJoin(organizations, eq(persons.sourceOrganizationId, organizations.id))
    .where(and(eq(persons.takeoverPending, true), isNull(persons.deletedAt)))
    .orderBy(desc(persons.createdAt));

  return (
    <div>
      <div className="page-h">
        <div><h1>Bewilligte Anträge</h1><div className="sub">Positiv beschieden · von TDD zu übernehmen · {rows.length} offen</div></div>
      </div>
      <div className="panel">
        {rows.length === 0 ? <div className="empty">Keine offenen Übernahmen. Neue bewilligte Anträge erscheinen hier automatisch.</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Person</th><th>Geburtsdatum</th><th>Herkunft</th><th>Bezugsort</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/personen/${r.id}`} className="font-semibold hover:underline">{r.last}, {r.first}</Link></td>
                  <td className="mono">{fmtDate(r.birth)}</td>
                  <td>{r.orgName ? <span className="pill muted">{r.orgType === "GEMEINDE" ? "Gemeinde" : "Institution"}: {r.orgName}</span> : "—"}</td>
                  <td>{r.locName ? <span className={`pill ${r.locType === "LADEN" ? "tag-shop" : "tag-out"}`}>{r.locName}</span> : <span className="pill bad">Standort fehlt</span>}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <Link href={`/personen/${r.id}`} className="btn ghost sm">Prüfen</Link>
                      <form action={takeoverPerson}><input type="hidden" name="personId" value={r.id} /><button className="btn primary sm" type="submit">Übernehmen</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      <p className="text-[.72rem] text-[color:var(--muted)] mt-3">Die Karte wird erst ausgestellt, wenn der Klient an der Ausgabestelle vorspricht (Dossier/Tresen-Kiosk).</p>
    </div>
  );
}
