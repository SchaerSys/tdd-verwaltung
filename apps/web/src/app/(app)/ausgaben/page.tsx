import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { loadTresenReport } from "@/lib/tresen-report";
import { fmtDate } from "@/lib/format";

const eur = (n: number) => n.toLocaleString("de-AT", { style: "currency", currency: "EUR" });

function isoDaysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function AusgabenPage({ searchParams }: { searchParams: Promise<{ von?: string; bis?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "distribution:record")) redirect("/dashboard");

  const sp = await searchParams;
  const von = /^\d{4}-\d{2}-\d{2}$/.test(sp.von ?? "") ? sp.von! : isoDaysAgo(29);
  const bis = /^\d{4}-\d{2}-\d{2}$/.test(sp.bis ?? "") ? sp.bis! : isoDaysAgo(0);

  const blocks = await loadTresenReport(von, bis);
  const sumPersons = blocks.reduce((a, b) => a + b.totalPersons, 0);
  const sumIncome = blocks.reduce((a, b) => a + b.totalIncome, 0);
  const sumAusstand = blocks.reduce((a, b) => a + b.totalAusstand, 0);
  const exportHref = `/ausgaben/export?von=${von}&bis=${bis}`;

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Ausgaben</h1>
          <div className="sub">Täglich getrackt je Ausgabestelle · {fmtDate(von)} – {fmtDate(bis)}</div>
        </div>
        <a href={exportHref} className="btn primary">⬇ Excel-Export</a>
      </div>

      <form className="panel mb-4" method="get">
        <div className="p-4 flex gap-3 items-end flex-wrap">
          <div className="field"><label className="lbl">Von</label><input type="date" name="von" defaultValue={von} className="inp mono" /></div>
          <div className="field"><label className="lbl">Bis</label><input type="date" name="bis" defaultValue={bis} className="inp mono" /></div>
          <button type="submit" className="btn">Filtern</button>
        </div>
      </form>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(190px,1fr))] mb-4">
        <div className="card stat"><div className="k">Personen (Summe/Tag)</div><div className="v">{sumPersons}</div><div className="d">über {blocks.length} Ausgabestellen</div></div>
        <div className="card stat"><div className="k">Einnahmen</div><div className="v">{eur(sumIncome)}</div></div>
        <div className="card stat"><div className="k">Ausstand (Schulden)</div><div className="v">{eur(sumAusstand)}</div></div>
      </div>

      <div className="flex flex-col gap-3">
        {blocks.map((b) => (
          <details key={b.locationId} className="panel acc" open={b.days.length > 0}>
            <summary className="acc-sum">
              <span className="acc-name">{b.name}</span>
              <span className="acc-meta">
                <span className="pill muted">{b.totalPersons} Pers.</span>
                <span className="pill good">{eur(b.totalIncome)}</span>
                {b.totalAusstand !== 0 ? <span className="pill warn">Ausstand {eur(b.totalAusstand)}</span> : null}
              </span>
            </summary>
            <div className="twrap">
              <table className="data">
                <thead><tr><th>Tag</th><th className="text-right">Personen</th><th className="text-right">Einnahmen</th><th className="text-right">Ausstand</th></tr></thead>
                <tbody>
                  {b.days.map((d) => (
                    <tr key={d.day}>
                      <td className="mono">{new Date(d.day).toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                      <td className="text-right mono">{d.persons}</td>
                      <td className="text-right mono">{eur(d.income)}</td>
                      <td className="text-right mono">{d.ausstand !== 0 ? eur(d.ausstand) : "—"}</td>
                    </tr>
                  ))}
                  {b.days.length === 0 ? <tr><td colSpan={4}><div className="empty">Keine Ausgaben im Zeitraum.</div></td></tr> : null}
                </tbody>
                {b.days.length > 0 ? (
                  <tfoot>
                    <tr className="total-row">
                      <td><b>Total</b></td>
                      <td className="text-right mono"><b>{b.totalPersons}</b></td>
                      <td className="text-right mono"><b>{eur(b.totalIncome)}</b></td>
                      <td className="text-right mono"><b>{eur(b.totalAusstand)}</b></td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </details>
        ))}
        {blocks.length === 0 ? <div className="empty">Keine Ausgabestellen.</div> : null}
      </div>
    </div>
  );
}
