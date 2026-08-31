import Link from "next/link";
import { desc } from "drizzle-orm";
import { antraege } from "@tdd/db";
import { getCurrentUser } from "@/lib/auth";
import { withOrg } from "@/lib/org";
import { fmtDate } from "@/lib/format";

function statusPill(s: string) {
  if (s === "POSITIV") return <span className="pill good"><span className="dot" />positiv</span>;
  if (s === "NEGATIV") return <span className="pill bad"><span className="dot" />negativ</span>;
  if (s === "IN_PRUEFUNG") return <span className="pill warn"><span className="dot" />in Prüfung</span>;
  return <span className="pill muted">offen</span>;
}

export default async function PortalHome() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId ?? 0;

  const rows = orgId
    ? await withOrg(orgId, (tx) =>
        tx.select({
          id: antraege.id, first: antraege.firstName, last: antraege.lastName,
          birth: antraege.birthDate, status: antraege.status, targetType: antraege.targetType,
          createdAt: antraege.createdAt,
        }).from(antraege).orderBy(desc(antraege.createdAt)).limit(200))
    : [];

  return (
    <div>
      <div className="page-h">
        <div><h1>Anträge</h1><div className="sub">{user?.organizationName} · {rows.length} {rows.length === 1 ? "Antrag" : "Anträge"}</div></div>
        <Link href="/portal/neu" className="btn primary">＋ Neuer Antrag</Link>
      </div>

      <div className="panel">
        <div className="twrap">
          <table className="data">
            <thead><tr><th>Antragsteller</th><th>Geburtsdatum</th><th>Bezugsort</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.last}, {r.first}</b></td>
                  <td className="mono">{fmtDate(r.birth)}</td>
                  <td><span className={`pill ${r.targetType === "LADEN" ? "tag-shop" : "tag-out"}`}>{r.targetType === "LADEN" ? "Laden" : "Ausgabestelle"}</span></td>
                  <td>{statusPill(r.status)}</td>
                  <td><Link href={`/portal/${r.id}`} className="btn ghost sm">Öffnen →</Link></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={5}><div className="empty">Noch keine Anträge. Über „Neuer Antrag" starten.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
