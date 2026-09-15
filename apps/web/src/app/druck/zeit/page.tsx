import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, lt, inArray } from "drizzle-orm";
import { staff, timeEvents } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PrintButton } from "@/components/PrintButton";
import { fmtMin, fmtSaldo, monatsUebersicht, viennaLocalToUtc, type Ev, type EventKind, type MonatsUebersicht } from "@/lib/zeit";
import { STAFF_TYPE_LABEL } from "@/app/(app)/personal/types";

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
  const heute = new Date();
  const vormonat = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() - 1, 1));
  const m = /^(\d{4})-(\d{2})$/.exec(sp.monat ?? "");
  const jahr = m ? Number(m[1]) : vormonat.getUTCFullYear();
  const monat = m ? Number(m[2]) : vormonat.getUTCMonth() + 1;
  if (monat < 1 || monat > 12) redirect("/druck/zeit");

  const d = db();
  const leute = await d.select().from(staff)
    .where(sp.staff ? eq(staff.id, sp.staff) : eq(staff.isActive, true))
    .orderBy(asc(staff.lastName), asc(staff.firstName));
  if (leute.length === 0) redirect("/personal");

  const von = viennaLocalToUtc(`${jahr}-${String(monat).padStart(2, "0")}-01T00:00`);
  const bisMonat = monat === 12 ? `${jahr + 1}-01` : `${jahr}-${String(monat + 1).padStart(2, "0")}`;
  const bis = viennaLocalToUtc(`${bisMonat}-01T00:00`);

  const evs = await d.select({ staffId: timeEvents.staffId, kind: timeEvents.kind, at: timeEvents.at })
    .from(timeEvents)
    .where(and(inArray(timeEvents.staffId, leute.map((p) => p.id)), gte(timeEvents.at, von), lt(timeEvents.at, bis)))
    .orderBy(asc(timeEvents.at));
  const jeStaff = new Map<string, Ev[]>();
  for (const e of evs) {
    if (!jeStaff.has(e.staffId)) jeStaff.set(e.staffId, []);
    jeStaff.get(e.staffId)!.push({ kind: e.kind as EventKind, at: e.at });
  }

  const blaetter = leute.map((p) => ({
    p, u: monatsUebersicht(jeStaff.get(p.id) ?? [], p.weeklyHours ? Number(p.weeklyHours) : null, jahr, monat),
  }));
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

      {blaetter.map(({ p, u }, i) => (
        <Blatt key={p.id} name={`${p.lastName}, ${p.firstName}`} typ={STAFF_TYPE_LABEL[p.staffType] ?? p.staffType}
               wochenstunden={p.weeklyHours ? Number(p.weeklyHours) : null} titel={titel} u={u} letztes={i === blaetter.length - 1} />
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

function Blatt({ name, typ, wochenstunden, titel, u, letztes }: {
  name: string; typ: string; wochenstunden: number | null; titel: string; u: MonatsUebersicht; letztes: boolean;
}) {
  const offene = u.tage.filter((t) => t.offen).length;
  return (
    <section className={`zblatt${letztes ? " letztes" : ""}`}>
      <h1>{name}</h1>
      <div className="meta">
        Zeiterfassung {titel} · {typ}{wochenstunden ? ` · ${wochenstunden} h/Woche` : " · keine Wochenstunden hinterlegt"}
      </div>
      <table>
        <thead>
          <tr><th>Tag</th><th></th><th>Kommen</th><th>Gehen</th><th className="z">Pause</th><th className="z">Ist</th><th className="z">Soll</th><th>Hinweis</th></tr>
        </thead>
        <tbody>
          {u.tage.map((t) => (
            <tr key={t.datum} className={`${!t.arbeitstag ? "we" : ""}${t.offen ? " offen" : ""}`}>
              <td>{t.datum.slice(8)}.</td>
              <td>{WOCHENTAG[t.wochentag]}</td>
              <td>{t.kommen ?? ""}</td>
              <td>{t.gehen ?? (t.offen ? "— offen —" : "")}</td>
              <td className="z">{t.breakMin ? fmtMin(t.breakMin) : ""}</td>
              <td className="z">{t.workedMin ? fmtMin(t.workedMin) : ""}</td>
              <td className="z">{t.sollMin ? fmtMin(t.sollMin) : ""}</td>
              <td className="hinweis">{t.hinweise.join("; ")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>Summe · {u.gebuchteTage} Tage gebucht, {u.arbeitstage} Werktage</td>
            <td className="z">{fmtMin(u.istMin)}</td>
            <td className="z">{fmtMin(u.sollMin)}</td>
            <td>Saldo {fmtSaldo(u.saldoMin)}</td>
          </tr>
        </tfoot>
      </table>
      {offene > 0 ? <p className="hinweis" style={{ marginTop: 8 }}>{offene} Tag(e) ohne Ausstempeln – im Ist mit 0 gerechnet. Bitte in der Zeiterfassung korrigieren.</p> : null}
      <p className="fuss" style={{ marginTop: 8 }}>
        <span>Soll: Wochenstunden ÷ 5 je Werktag Mo–Fr. Feiertage und Urlaub sind nicht abgezogen.</span>
      </p>
      <div className="unterschrift">
        <div>Mitarbeiter:in</div>
        <div>Verein</div>
      </div>
      <div className="fuss"><span>Tischlein deck dich Vorarlberg · TDD-Verwaltung</span><span>Erstellt {new Date().toLocaleDateString("de-AT")}</span></div>
    </section>
  );
}
