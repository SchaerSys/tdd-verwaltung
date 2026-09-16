import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeKonten } from "@/lib/abwesenheit-daten";
import { ABW_ART_LABEL, dienstjahre } from "@/lib/abwesenheit";
import { heuteIso } from "@/lib/touren";
import { fmtDate } from "@/lib/format";
import { STAFF_TYPE_LABEL } from "../../personal/types";

export const dynamic = "force-dynamic";

/** Urlaubskonto (UrlG), Krankenstand (EFZG) und Pflegefreistellung je Person am Stichtag. */
export default async function KontoSeite({ searchParams }: { searchParams: Promise<{ staff?: string; stichtag?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const stichtag = /^\d{4}-\d{2}-\d{2}$/.test(sp.stichtag ?? "") ? sp.stichtag! : heuteIso();
  const konten = await ladeKonten(stichtag, sp.staff);
  const verfall = konten.filter((k) => k.urlaub?.verfaelltDemnaechst && k.urlaub.verfaelltDemnaechst.am <= stichtag.slice(0, 4) + "-12-31");

  return (
    <div>
      <div className="page-h">
        <div><h1>Urlaubskonten</h1><div className="sub">Stichtag {fmtDate(stichtag)} · {konten.length} Person(en){verfall.length ? ` · ${verfall.length} mit Verfall in diesem Jahr` : ""}</div></div>
        <div className="flex gap-2 items-center">
          <form method="get" className="flex gap-1"><input type="date" name="stichtag" defaultValue={stichtag} className="inp mono" />{sp.staff ? <input type="hidden" name="staff" value={sp.staff} /> : null}<button className="btn" type="submit">Anzeigen</button></form>
          {sp.staff ? <Link href="/abwesenheiten/konto" className="btn ghost">Alle</Link> : null}
          <Link href="/abwesenheiten" className="btn ghost">← Abwesenheiten</Link>
        </div>
      </div>

      {!sp.staff ? (
        <div className="panel mb-4">
          <div className="twrap"><table className="data">
            <thead><tr><th>Person</th><th>Urlaubsjahr</th><th className="text-right">Anspruch</th><th className="text-right">Übertrag</th><th className="text-right">verbraucht</th><th className="text-right">geplant</th><th className="text-right">Rest</th><th>Verfall</th><th className="text-right">Krank (Tage)</th><th className="text-right">Pflege</th><th></th></tr></thead>
            <tbody>{konten.map((k) => (
              <tr key={k.person.id}>
                <td><b>{k.person.lastName} {k.person.firstName}</b><div className="text-xs text-muted">{STAFF_TYPE_LABEL[k.person.staffType] ?? k.person.staffType}</div></td>
                {k.urlaub ? <>
                  <td className="mono text-xs">{fmtDate(k.urlaub.jahr.start)} – {fmtDate(k.urlaub.jahr.ende)}</td>
                  <td className="mono text-right">{k.urlaub.anspruch}</td><td className="mono text-right">{k.urlaub.uebertrag}</td>
                  <td className="mono text-right">{k.urlaub.verbraucht}</td><td className="mono text-right">{k.urlaub.geplant}</td>
                  <td className="mono text-right"><b style={{ color: k.urlaub.rest < 0 ? "var(--bad)" : undefined }}>{k.urlaub.rest}</b></td>
                  <td className="text-xs">{k.urlaub.verfaelltDemnaechst ? <span className={`pill ${k.urlaub.verfaelltDemnaechst.am <= stichtag.slice(0, 4) + "-12-31" ? "warn" : "muted"}`}>{k.urlaub.verfaelltDemnaechst.tage} Tage bis {fmtDate(k.urlaub.verfaelltDemnaechst.am)}</span> : "—"}</td>
                  <td className="mono text-right">{k.krank?.tage ?? 0}{k.krank?.laufender ? <span className="pill bad" style={{ marginLeft: 4 }}>krank</span> : ""}</td>
                  <td className="mono text-right">{k.pflege ? `${k.pflege.rest}/${k.pflege.anspruch}` : "—"}</td>
                </> : <td colSpan={8} className="text-xs" style={{ color: "var(--warn)" }}>{k.fehlt}</td>}
                <td><Link href={`/abwesenheiten/konto?staff=${k.person.id}`} className="btn ghost sm">Öffnen →</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="p-3 text-[.72rem] text-muted">Anspruch in Arbeitstagen = Wochen × Arbeitstage laut Wochenverteilung (5-Tage-Woche: 25, ab 25 Dienstjahren 30). Übertrag verfällt 2 Jahre nach Ende des Urlaubsjahres (§ 4 Abs 5 UrlG), ältester Urlaub wird zuerst verbraucht. Krankenstand in Kalendertagen je Arbeitsjahr (EFZG).</div>
        </div>
      ) : null}

      {sp.staff ? konten.map((k) => (
        <div key={k.person.id}>
          <div className="grid gap-4 lg:grid-cols-3 items-start mb-4">
            <div className="panel">
              <div className="panel-h"><h3>Urlaub (UrlG)</h3>{k.urlaub ? <span className="pill muted">{k.urlaub.wochen} Wochen · {k.urlaub.arbeitstageWoche} Tage/Woche</span> : null}</div>
              {k.urlaub ? (
                <div className="p-4 text-[.8125rem] flex flex-col gap-1">
                  <div><span className="text-muted">Urlaubsjahr:</span> {fmtDate(k.urlaub.jahr.start)} – {fmtDate(k.urlaub.jahr.ende)} (Jahr {k.urlaub.jahr.nr}, {k.person.urlaubsjahr === "KALENDER" ? "Kalenderjahr" : "Arbeitsjahr"})</div>
                  <div><span className="text-muted">Dienstjahre:</span> {dienstjahre({ eintritt: k.person.employmentStart!, urlaubsjahr: "ARBEIT", wochen: 5, uebertragTage: 0, uebertragAb: null, dienstjahreAnrechnung: Number(k.person.dienstjahreAnrechnung ?? 0) }, stichtag).toFixed(1)}</div>
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    <div>Anspruch {k.urlaub.jahr.nr === 1 ? "(aliquot)" : ""}</div><div className="mono text-right">{k.urlaub.anspruch}</div>
                    <div>+ Übertrag Vorjahre</div><div className="mono text-right">{k.urlaub.uebertrag}</div>
                    <div>− verbraucht bis Stichtag</div><div className="mono text-right">{k.urlaub.verbraucht}</div>
                    <div>− genehmigt geplant</div><div className="mono text-right">{k.urlaub.geplant}</div>
                    <div className="font-bold border-t border-[color:var(--border)] pt-1">Rest</div><div className="mono text-right font-bold border-t border-[color:var(--border)] pt-1" style={{ color: k.urlaub.rest < 0 ? "var(--bad)" : "var(--good)" }}>{k.urlaub.rest} Tage</div>
                  </div>
                  {k.urlaub.verfaelltDemnaechst ? <div className="mt-2 pill warn">{k.urlaub.verfaelltDemnaechst.tage} Tage verfallen am {fmtDate(k.urlaub.verfaelltDemnaechst.am)}</div> : null}
                  <div className="mt-2 text-xs text-muted">Je Urlaubsjahr:</div>
                  <table className="data" style={{ fontSize: ".72rem" }}><thead><tr><th>Jahr</th><th className="text-right">Anspruch</th><th className="text-right">verbraucht</th><th className="text-right">Rest</th><th>verfällt</th></tr></thead>
                    <tbody>{k.urlaub.jahre.map((j) => <tr key={j.start}><td className="mono">{fmtDate(j.start)}</td><td className="mono text-right">{j.anspruch}{j.aliquot ? "*" : ""}</td><td className="mono text-right">{j.verbraucht}</td><td className="mono text-right">{j.rest}{j.verfallen ? ` (${j.verfallen} verfallen)` : ""}</td><td className="mono">{fmtDate(j.verfaelltAm)}</td></tr>)}</tbody></table>
                </div>
              ) : <div className="p-4 text-[.8125rem]" style={{ color: "var(--warn)" }}>{k.fehlt} <Link href={`/personal/${k.person.id}`}>Personal-Datensatz →</Link></div>}
            </div>
            <div className="panel">
              <div className="panel-h"><h3>Krankenstand (EFZG)</h3>{k.krank?.laufender ? <span className="pill bad">derzeit krank</span> : null}</div>
              {k.krank ? (
                <div className="p-4 text-[.8125rem] flex flex-col gap-1">
                  <div><span className="text-muted">Im Arbeitsjahr:</span> {k.krank.tage} Kalendertage in {k.krank.faelle} Fall/Fällen</div>
                  <div><span className="text-muted">Entgeltfortzahlung voll:</span> {k.krank.anspruchVollTage / 7} Wochen ({k.krank.anspruchVollTage} Tage) + 4 Wochen halb</div>
                  <div><span className="text-muted">Davon noch offen:</span> <b style={{ color: k.krank.restVollTage < 14 ? "var(--warn)" : undefined }}>{k.krank.restVollTage} Tage</b></div>
                  <div className="text-xs text-muted mt-2">§ 2 EFZG: 6 Wochen voll bis zum 5. Dienstjahr, 8 ab dem 5., 10 ab dem 15., 12 ab dem 25.; danach 4 Wochen halbes Entgelt. Nach Ausschöpfung Krankengeld der ÖGK.</div>
                </div>
              ) : <div className="p-4 text-[.8125rem] text-muted">—</div>}
            </div>
            <div className="panel">
              <div className="panel-h"><h3>Pflegefreistellung (§ 16 UrlG)</h3></div>
              {k.pflege ? <div className="p-4 text-[.8125rem]"><div>{k.pflege.verbraucht} von {k.pflege.anspruch} Arbeitstagen verbraucht · <b>{k.pflege.rest} offen</b></div><div className="text-xs text-muted mt-2">Eine Arbeitswoche je Arbeitsjahr für erkrankte nahe Angehörige; eine zweite Woche für Kinder unter 12 – bei Bedarf als Sonderurlaub erfassen.</div></div> : <div className="p-4 text-[.8125rem] text-muted">—</div>}
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Alle Abwesenheiten</h3><span className="pill muted">{k.eintraege.length}</span><Link href={`/personal/${k.person.id}`} className="btn ghost sm" style={{ marginLeft: "auto" }}>Urlaubs-Stammdaten →</Link></div>
            <div className="twrap"><table className="data"><thead><tr><th>Art</th><th>Von</th><th>Bis</th><th>Stand</th><th>Notiz</th></tr></thead>
              <tbody>{k.eintraege.map((e) => <tr key={e.id} style={e.status === "ABGELEHNT" ? { opacity: .5 } : undefined}><td><span className="pill muted">{ABW_ART_LABEL[e.art]}</span></td><td className="mono">{fmtDate(e.von)}</td><td className="mono">{fmtDate(e.bis)}{e.halbtag ? " ½" : ""}</td><td className="text-xs">{e.status.toLowerCase()}{e.art === "KRANK" ? (e.bestaetigung ? " · Bestätigung ✓" : " · ohne Bestätigung") : ""}</td><td className="text-xs">{e.notiz ?? ""}</td></tr>)}
              {k.eintraege.length === 0 ? <tr><td colSpan={5}><div className="empty">Noch keine Abwesenheiten.</div></td></tr> : null}</tbody></table></div>
          </div>
        </div>
      )) : null}
    </div>
  );
}
