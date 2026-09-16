import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeMonat } from "@/lib/azg-daten";
import { fmtMin, fmtSaldo } from "@/lib/zeit";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** AZG-Pruefung ueber alle Personen: Verstoesse, Salden, Abschluss-Stand – die Sicht fuers Buero am Monatsanfang. */
export default async function PruefungSeite({ searchParams }: { searchParams: Promise<{ monat?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const heute = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(sp.monat ?? "");
  const jahr = m ? Number(m[1]) : heute.getUTCFullYear();
  const monat = m ? Number(m[2]) : heute.getUTCMonth() + 1;
  const monatParam = `${jahr}-${String(monat).padStart(2, "0")}`;
  const liste = await ladeMonat(jahr, monat);
  const alleWarnungen = liste.flatMap((p) => p.auswertung.warnungen.map((w) => ({ ...w, name: `${p.person.lastName} ${p.person.firstName}`, staffId: p.person.id }))).sort((a, b) => a.datum.localeCompare(b.datum));
  const offen = liste.filter((p) => !p.abschluss).length;

  return (
    <div>
      <div className="page-h">
        <div><h1>AZG-Prüfung</h1><div className="sub">{MONATE[monat - 1]} {jahr} · {alleWarnungen.length} Hinweise · {offen} von {liste.length} Monaten offen</div></div>
        <div className="flex gap-2 items-center">
          <form method="get" className="flex gap-1"><input type="month" name="monat" defaultValue={monatParam} className="inp mono" /><button className="btn" type="submit">Anzeigen</button></form>
          <Link href="/zeit/regeln" className="btn ghost">Regeln</Link>
          <Link href="/zeit" className="btn ghost">← Zeiterfassung</Link>
        </div>
      </div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Personen</h3></div>
        <div className="twrap"><table className="data">
          <thead><tr><th>Person</th><th className="text-right">Ist</th><th className="text-right">Soll</th><th className="text-right">Gutschrift</th><th className="text-right">Monat</th><th className="text-right">Zeitkonto</th><th className="text-right">Mehrarbeit</th><th className="text-right">Überstunden</th><th>Hinweise</th><th>Stand</th><th></th></tr></thead>
          <tbody>{liste.map(({ person: p, auswertung: a, abschluss, kontoMin }) => (
            <tr key={p.id}>
              <td><b>{p.lastName} {p.firstName}</b></td>
              <td className="mono text-right">{fmtMin(a.istMin)}</td><td className="mono text-right">{fmtMin(a.sollMin)}</td><td className="mono text-right">{a.gutschriftMin ? fmtMin(a.gutschriftMin) : ""}</td>
              <td className="mono text-right" style={{ color: a.saldoMin < 0 ? "var(--warn)" : undefined }}>{fmtSaldo(a.saldoMin)}</td>
              <td className="mono text-right" style={{ color: kontoMin < 0 ? "var(--bad)" : "var(--good)" }}>{fmtSaldo(kontoMin)}</td>
              <td className="mono text-right">{a.mehrarbeitMin ? fmtMin(a.mehrarbeitMin) : ""}</td><td className="mono text-right">{a.ueberstundenMin ? fmtMin(a.ueberstundenMin) : ""}</td>
              <td>{a.warnungen.length ? <span className={`pill ${a.warnungen.some((w) => w.schwere === "FEHLER") ? "bad" : "warn"}`}>{a.warnungen.length}</span> : <span className="pill good"><span className="dot" />ok</span>}</td>
              <td>{abschluss ? <span className="pill good">🔒</span> : <span className="pill muted">offen</span>}</td>
              <td><Link href={`/zeit/monat?monat=${monatParam}&staff=${p.id}`} className="btn ghost sm">Öffnen →</Link></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Hinweise nach AZG/ARG</h3><span className="pill muted">{alleWarnungen.length}</span></div>
        {alleWarnungen.length === 0 ? <div className="empty">Keine Auffälligkeiten in diesem Monat.</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Datum</th><th>Person</th><th>Art</th><th>Hinweis</th></tr></thead>
            <tbody>{alleWarnungen.map((w, i) => (
              <tr key={i} style={w.schwere === "FEHLER" ? { background: "var(--bad-bg)" } : undefined}>
                <td className="mono">{fmtDate(w.datum)}</td><td><Link href={`/zeit/monat?monat=${monatParam}&staff=${w.staffId}`}>{w.name}</Link></td>
                <td><span className={`pill ${w.schwere === "FEHLER" ? "bad" : "warn"}`}>{w.code.replace(/_/g, " ").toLowerCase()}</span></td><td className="text-xs">{w.text}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
