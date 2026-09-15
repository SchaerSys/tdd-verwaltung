import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeRueckfragen } from "@/lib/rueckfragen";
import { fmtDate, fmtDateTime } from "@/lib/format";

/** TDD-Buero: Rueckfragen der Gemeinden/Institutionen zu ihren Antraegen. */
export default async function RueckfragenPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) redirect("/dashboard");
  const faelle = await ladeRueckfragen();
  const offen = faelle.filter((f) => f.ungelesen > 0).length;

  return (
    <div>
      <div className="page-h">
        <div><h1>Rückfragen</h1><div className="sub">Verlauf mit Gemeinden und Institutionen · {offen} unbeantwortet · {faelle.length} Fälle</div></div>
      </div>
      <div className="panel">
        {faelle.length === 0 ? <div className="empty">Keine Rückfragen. Sobald eine Gemeinde oder Institution im Portal eine Frage zu einem Antrag stellt, erscheint sie hier.</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Person</th><th>Organisation</th><th>Antrag</th><th>Letzte Nachricht</th><th></th><th></th></tr></thead>
            <tbody>
              {faelle.map((f) => (
                <tr key={f.antragId}>
                  <td>
                    {f.transferredPersonId
                      ? <Link href={`/personen/${f.transferredPersonId}`} className="font-semibold hover:underline">{f.lastName}, {f.firstName}</Link>
                      : <b>{f.lastName}, {f.firstName}</b>}
                    <span className="text-xs text-muted mono" style={{ marginLeft: 6 }}>{fmtDate(f.birthDate)}</span>
                  </td>
                  <td><span className="pill muted">{f.orgType === "GEMEINDE" ? "Gemeinde" : "Institution"}</span> {f.orgName}</td>
                  <td><span className={`pill ${f.status === "POSITIV" ? "good" : f.status === "NEGATIV" ? "bad" : "muted"}`}>{f.status.toLowerCase()}</span> <span className="text-xs text-muted mono">{fmtDate(f.antragAm)}</span></td>
                  <td className="mono text-xs">{fmtDateTime(f.letzteAm)}</td>
                  <td>{f.ungelesen > 0 ? <span className="pill warn">✉ {f.ungelesen} unbeantwortet</span> : <span className="pill good"><span className="dot" />beantwortet</span>}</td>
                  <td><Link href={`/rueckfragen/${f.antragId}`} className="btn ghost sm">Öffnen →</Link></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      <p className="text-[.72rem] text-[color:var(--muted)] mt-3">Die Anträge selbst bleiben bei der Organisation (Mandantentrennung). Sichtbar sind hier nur Name, Geburtsdatum und Status – das, was zum Beantworten nötig ist.</p>
    </div>
  );
}
