import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeMonat } from "@/lib/azg-daten";
import { fmtMin, fmtSaldo } from "@/lib/zeit";
import { WOCHENTAGE_KURZ } from "@/lib/touren";
import { fmtDateTime } from "@/lib/format";
import { STAFF_TYPE_LABEL } from "../../personal/types";
import { monatAbschliessen, monatOeffnen } from "../azg-actions";

export const dynamic = "force-dynamic";
const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** Monatsauswertung je Person nach AZG: Soll aus Verteilung, Feiertage/Abwesenheiten als Gutschrift, Pruefungen, Zeitkonto, Abschluss. */
export default async function MonatSeite({ searchParams }: { searchParams: Promise<{ monat?: string; staff?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const heute = new Date();
  const vormonat = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() - 1, 1));
  const m = /^(\d{4})-(\d{2})$/.exec(sp.monat ?? "");
  const jahr = m ? Number(m[1]) : vormonat.getUTCFullYear();
  const monat = m ? Number(m[2]) : vormonat.getUTCMonth() + 1;
  const monatParam = `${jahr}-${String(monat).padStart(2, "0")}`;
  const liste = await ladeMonat(jahr, monat, sp.staff);
  const admin = hasPermission(user.role, "admin:manage");

  return (
    <div>
      <div className="page-h">
        <div><h1>Monatsauswertung</h1><div className="sub">{MONATE[monat - 1]} {jahr} · {liste.length} Person(en) · Soll aus Wochenverteilung, Feiertage und Abwesenheiten als Gutschrift</div></div>
        <div className="flex gap-2 items-center">
          <form method="get" className="flex gap-1"><input type="month" name="monat" defaultValue={monatParam} className="inp mono" />{sp.staff ? <input type="hidden" name="staff" value={sp.staff} /> : null}<button className="btn" type="submit">Anzeigen</button></form>
          {sp.staff ? <Link href={`/zeit/monat?monat=${monatParam}`} className="btn ghost">Alle</Link> : null}
          <Link href={`/druck/zeit?monat=${monatParam}${sp.staff ? `&staff=${sp.staff}` : ""}`} className="btn ghost" target="_blank">🖨 Drucken</Link>
          <Link href="/zeit" className="btn ghost">← Zeiterfassung</Link>
        </div>
      </div>

      {liste.map(({ person: p, auswertung: a, abschluss, kontoMin, kontoStart }) => {
        const fehler = a.warnungen.filter((w) => w.schwere === "FEHLER").length;
        return (
          <details key={p.id} className="panel mb-3" open={!!sp.staff || liste.length === 1}>
            <summary className="p-3 cursor-pointer flex gap-3 items-center flex-wrap list-none">
              <b>{p.lastName} {p.firstName}</b><span className="text-xs text-muted">{STAFF_TYPE_LABEL[p.staffType] ?? p.staffType}{p.weeklyHours ? ` · ${p.weeklyHours} h/Woche` : ""}</span>
              <span className="pill muted">Ist {fmtMin(a.istMin)}</span><span className="pill muted">Soll {fmtMin(a.sollMin)}</span>
              {a.gutschriftMin ? <span className="pill tag-out">Gutschrift {fmtMin(a.gutschriftMin)}</span> : null}
              <span className={`pill ${a.saldoMin < 0 ? "warn" : "good"}`}>Monat {fmtSaldo(a.saldoMin)}</span>
              <span className={`pill ${kontoMin < 0 ? "bad" : "good"}`} title={kontoStart ? `Zeitkonto seit ${kontoStart}` : "Zeitkonto ab Eintritt"}>Konto {fmtSaldo(kontoMin)}</span>
              {a.mehrarbeitMin ? <span className="pill warn">Mehrarbeit {fmtMin(a.mehrarbeitMin)}</span> : null}
              {a.ueberstundenMin ? <span className="pill bad">Überstunden {fmtMin(a.ueberstundenMin)}</span> : null}
              {a.warnungen.length ? <span className={`pill ${fehler ? "bad" : "warn"}`}>{a.warnungen.length} Hinweise</span> : <span className="pill good"><span className="dot" />AZG ok</span>}
              {abschluss ? <span className="pill good">🔒 abgeschlossen {fmtDateTime(abschluss.abgeschlossenAt)}</span> : <span className="pill muted">offen</span>}
            </summary>
            <div className="twrap"><table className="data">
              <thead><tr><th>Tag</th><th></th><th>Kommen</th><th>Gehen</th><th className="text-right">Pause</th><th className="text-right">Ist</th><th className="text-right">Soll</th><th className="text-right">Gutschrift</th><th>Hinweise</th></tr></thead>
              <tbody>{a.tage.map((t) => (
                <tr key={t.datum} style={t.wochentag >= 6 ? { color: "var(--muted)", background: "var(--surface-2)" } : t.warnungen.some((w) => w.schwere === "FEHLER") ? { background: "var(--bad-bg)" } : t.warnungen.length ? { background: "var(--warn-bg)" } : undefined}>
                  <td className="mono">{t.datum.slice(8)}.</td><td>{WOCHENTAGE_KURZ[t.wochentag]}</td>
                  <td className="mono">{t.kommen ?? ""}</td><td className="mono">{t.gehen ?? (t.offen ? "— offen —" : "")}</td>
                  <td className="mono text-right">{t.breakMin ? fmtMin(t.breakMin) : ""}</td>
                  <td className="mono text-right">{t.istMin ? fmtMin(t.istMin) : ""}</td>
                  <td className="mono text-right">{t.sollMin ? fmtMin(t.sollMin) : ""}</td>
                  <td className="text-right text-xs">{t.gutschriftMin ? `${fmtMin(t.gutschriftMin)} ${t.gutschriftGrund}` : ""}</td>
                  <td className="text-xs">{t.warnungen.map((w) => w.text).join(" · ")}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={5}><b>Summe</b> · {a.feiertage} Feiertag(e), {a.abwesenheitstage} Abwesenheitstag(e)</td><td className="mono text-right"><b>{fmtMin(a.istMin)}</b></td><td className="mono text-right"><b>{fmtMin(a.sollMin)}</b></td><td className="mono text-right"><b>{fmtMin(a.gutschriftMin)}</b></td><td><b>Saldo {fmtSaldo(a.saldoMin)}</b></td></tr></tfoot>
            </table></div>
            {a.wochen.some((w) => w.mehrarbeitMin || w.ueberstundenMin) ? (
              <div className="p-3 text-[.8125rem] border-t border-[color:var(--border)]">
                <b>Wochen:</b> {a.wochen.map((w) => <span key={w.kw} className="mr-3">{w.kw}: {fmtMin(w.istMin)}{w.mehrarbeitMin ? ` · Mehrarbeit ${fmtMin(w.mehrarbeitMin)}` : ""}{w.ueberstundenMin ? ` · Überstunden ${fmtMin(w.ueberstundenMin)}` : ""}</span>)}
              </div>
            ) : null}
            <div className="p-3 border-t border-[color:var(--border)] flex gap-2 items-center flex-wrap text-[.8125rem]">
              {abschluss ? (
                <>
                  <span>Abgeschlossen am {fmtDateTime(abschluss.abgeschlossenAt)} · eingefroren: Saldo {fmtSaldo(abschluss.saldoMin)}, Konto {fmtSaldo(abschluss.kontoMin)}. Buchungen sind gesperrt.</span>
                  {admin ? <form action={monatOeffnen}><input type="hidden" name="staffId" value={p.id} /><input type="hidden" name="jahr" value={jahr} /><input type="hidden" name="monat" value={monat} /><button className="btn ghost sm" type="submit">Wieder öffnen (Admin)</button></form> : null}
                </>
              ) : (
                <form action={monatAbschliessen}><input type="hidden" name="staffId" value={p.id} /><input type="hidden" name="jahr" value={jahr} /><input type="hidden" name="monat" value={monat} />
                  <button className="btn primary sm" type="submit" disabled={a.tage.some((t) => t.offen)} title={a.tage.some((t) => t.offen) ? "Offene Tage zuerst korrigieren" : undefined}>🔒 Monat abschließen</button></form>
              )}
              <Link href={`/zeit?staff=${p.id}&monat=${monatParam}`} className="btn ghost sm">Buchungen korrigieren</Link>
              <Link href={`/personal/${p.id}`} className="btn ghost sm">Wochenverteilung</Link>
            </div>
          </details>
        );
      })}
      {liste.length === 0 ? <div className="panel"><div className="empty">Niemand gefunden.</div></div> : null}
      <p className="text-[.72rem] text-muted mt-2">Gutschrift: an Feiertagen, betriebsfreien Tagen und bei Urlaub/Krankenstand gilt das Tagessoll als geleistet. Mehrarbeit = Teilzeit über Vertragsstunden bis 40 h (25 % Zuschlag, § 19d AZG), Überstunden = über 40 h (50 %, § 10 AZG) – Zuschläge laut Regeln/KV.</p>
    </div>
  );
}
