import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PrintButton } from "@/components/PrintButton";
import { fmtMin, fmtSaldo } from "@/lib/zeit";
import { ladeMonat } from "@/lib/azg-daten";
import type { MonatAuswertung } from "@/lib/azg";
import { STAFF_TYPE_LABEL } from "@/app/(app)/personal/types";
import { mandant } from "@/lib/mandant";

const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/**
 * Monatsuebersicht der Zeiterfassung zum Ausdrucken.
 *   /druck/zeit?monat=2026-09&staff=<id>    eine Person
 *   /druck/zeit?monat=2026-09               alle aktiven, je eine Seite
 * Vormonat ist die Vorgabe, weil der Ausdruck am Monatsanfang fuer den Vormonat gemacht wird.
 */
export default async function ZeitDruck({ searchParams }: { searchParams: Promise<{ monat?: string; staff?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "staff:manage")) redirect("/dashboard");

  const sp = await searchParams;
  const firma = await mandant();
  const heute = new Date();
  const vormonat = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() - 1, 1));
  const m = /^(\d{4})-(\d{2})$/.exec(sp.monat ?? "");
  const jahr = m ? Number(m[1]) : vormonat.getUTCFullYear();
  const monat = m ? Number(m[2]) : vormonat.getUTCMonth() + 1;
  if (monat < 1 || monat > 12) redirect("/druck/zeit");

  const liste = await ladeMonat(jahr, monat, sp.staff);
  if (liste.length === 0) redirect("/personal");
  const blaetter = liste.map((x) => ({ p: x.person, u: x.auswertung, konto: x.kontoMin, abschluss: x.abschluss }));
  const titel = `${MONATE[monat - 1]} ${jahr}`;
  const monatParam = `${jahr}-${String(monat).padStart(2, "0")}`;

  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh" }}>
      <div className="no-print" style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/zeit" className="btn ghost">← Zeiterfassung</Link>
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="month" name="monat" defaultValue={monatParam} className="inp" />
          {sp.staff ? <input type="hidden" name="staff" value={sp.staff} /> : null}
          <button className="btn" type="submit">Anzeigen</button>
        </form>
        {sp.staff ? <Link href={`/druck/zeit?monat=${monatParam}`} className="btn ghost">Alle Mitarbeitenden</Link> : null}
        <span style={{ marginLeft: "auto" }}><PrintButton /></span>
      </div>

      {blaetter.map(({ p, u, konto, abschluss }, i) => (
        <Blatt key={p.id} firma={firma.kurzname} name={`${p.lastName}, ${p.firstName}`} typ={STAFF_TYPE_LABEL[p.staffType] ?? p.staffType}
               wochenstunden={p.weeklyHours ? Number(p.weeklyHours) : null} titel={titel} u={u} konto={konto} abgeschlossen={!!abschluss} letztes={i === blaetter.length - 1} />
      ))}
      <style>{`
        @page { size: A4; margin: 14mm; }
        .zblatt { max-width: 190mm; margin: 0 auto; padding: 18px 12px; font-size: 11.5px; page-break-after: always; }
        .zblatt.letztes { page-break-after: auto; }
        .zblatt h1 { font-size: 17px; margin: 0 0 2px; }
        .zblatt .meta { color: #555; margin-bottom: 12px; }
        .zblatt table { width: 100%; border-collapse: collapse; }
        .zblatt th, .zblatt td { padding: 3px 6px; border-bottom: 1px solid #e3e3e3; text-align: left; }
        .zblatt th { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 2px solid #999; }
        .zblatt td.z, .zblatt th.z { text-align: right; font-variant-numeric: tabular-nums; }
        .zblatt tr.we td { color: #999; background: #fafafa; }
        .zblatt tr.offen td { color: #a00; }
        .zblatt tfoot td { font-weight: 700; border-top: 2px solid #333; border-bottom: 0; }
        .zblatt .hinweis { font-size: 10px; color: #a00; }
        .zblatt .fuss { margin-top: 18px; display: flex; justify-content: space-between; font-size: 10px; color: #555; }
        .zblatt .unterschrift { margin-top: 30px; display: flex; gap: 40px; }
        .zblatt .unterschrift div { flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; color: #555; }
      `}</style>
    </div>
  );
}

function Blatt({ name, typ, wochenstunden, titel, u, konto, abgeschlossen, letztes, firma }: {
  name: string; typ: string; wochenstunden: number | null; titel: string; u: MonatAuswertung; konto: number; abgeschlossen: boolean; letztes: boolean; firma: string;
}) {
  const offene = u.tage.filter((t) => t.offen).length;
  return (
    <section className={`zblatt${letztes ? " letztes" : ""}`}>
      <h1>{name}</h1>
      <div className="meta">
        Arbeitszeitaufzeichnung {titel} · {typ}{wochenstunden ? ` · ${wochenstunden} h/Woche` : " · keine Wochenstunden hinterlegt"}{abgeschlossen ? " · abgeschlossen" : " · vorläufig"}
      </div>
      <table>
        <thead>
          <tr><th>Tag</th><th></th><th>Kommen</th><th>Gehen</th><th className="z">Pause</th><th className="z">Ist</th><th className="z">Soll</th><th className="z">Gutschrift</th><th>Hinweis</th></tr>
        </thead>
        <tbody>
          {u.tage.map((t) => (
            <tr key={t.datum} className={`${t.wochentag >= 6 ? "we" : ""}${t.offen ? " offen" : ""}`}>
              <td>{t.datum.slice(8)}.</td>
              <td>{WOCHENTAG[t.wochentag % 7]}</td>
              <td>{t.kommen ?? ""}</td>
              <td>{t.gehen ?? (t.offen ? "— offen —" : "")}</td>
              <td className="z">{t.breakMin ? fmtMin(t.breakMin) : ""}</td>
              <td className="z">{t.istMin ? fmtMin(t.istMin) : ""}</td>
              <td className="z">{t.sollMin ? fmtMin(t.sollMin) : ""}</td>
              <td className="z">{t.gutschriftMin ? `${fmtMin(t.gutschriftMin)} ${t.gutschriftGrund ?? ""}` : ""}</td>
              <td className="hinweis">{t.warnungen.map((w) => w.text).join("; ")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>Summe · {u.feiertage} Feiertag(e), {u.abwesenheitstage} Abwesenheitstag(e)</td>
            <td className="z">{fmtMin(u.istMin)}</td>
            <td className="z">{fmtMin(u.sollMin)}</td>
            <td className="z">{fmtMin(u.gutschriftMin)}</td>
            <td>Monat {fmtSaldo(u.saldoMin)} · Zeitkonto {fmtSaldo(konto)}</td>
          </tr>
        </tfoot>
      </table>
      {u.mehrarbeitMin || u.ueberstundenMin ? <p style={{ marginTop: 6 }}>Mehrarbeit (Teilzeit): {fmtMin(u.mehrarbeitMin)} · Überstunden: {fmtMin(u.ueberstundenMin)}</p> : null}
      {offene > 0 ? <p className="hinweis" style={{ marginTop: 8 }}>{offene} Tag(e) ohne Ausstempeln – im Ist mit 0 gerechnet. Bitte in der Zeiterfassung korrigieren.</p> : null}
      <p className="fuss" style={{ marginTop: 8 }}>
        <span>Soll aus der Wochenverteilung; Feiertage, betriebsfreie Tage und Abwesenheiten als Gutschrift. Aufzeichnung gemäß § 26 AZG.</span>
      </p>
      <div className="unterschrift">
        <div>Mitarbeiter:in</div>
        <div>Verein</div>
      </div>
      <div className="fuss"><span>{firma} · Tafelwerk</span><span>Erstellt {new Date().toLocaleDateString("de-AT")}</span></div>
    </section>
  );
}
