import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { abwesenheiten, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { freieTage } from "@/lib/abwesenheit-daten";
import { zivildienstKonto } from "@/lib/zivildienst";
import { heuteIso } from "@/lib/touren";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Zivildienst-Übersicht (P6): Dienstzeit, Dienstfreistellung (§ 23a ZDG), Fehltage/Verlängerung (§ 21 ZDG), Meldehinweise. */
export default async function ZiviSeite({ searchParams }: { searchParams: Promise<{ stichtag?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const stichtag = /^\d{4}-\d{2}-\d{2}$/.test(sp.stichtag ?? "") ? sp.stichtag! : heuteIso();
  const zivis = await db().select().from(staff).where(eq(staff.staffType, "ZIVILDIENER")).orderBy(asc(staff.isActive), asc(staff.lastName));
  const jahr = Number(stichtag.slice(0, 4));
  const [abw, frei] = zivis.length ? await Promise.all([
    db().select().from(abwesenheiten).where(inArray(abwesenheiten.staffId, zivis.map((z) => z.id))),
    freieTage([jahr - 1, jahr, jahr + 1]),
  ]) : [[], new Set<string>()];

  const zeilen = zivis.map((z) => {
    const beginn = z.ziviBeginn ?? z.employmentStart;
    const konto = beginn ? zivildienstKonto({ beginn, ende: z.ziviEnde, fehltageVor: z.ziviFehltageVor }, abw.filter((a) => a.staffId === z.id), frei, stichtag) : null;
    return { z, konto };
  });

  return (
    <div>
      <div className="page-h">
        <div><h1>Zivildienst</h1><div className="sub">Stichtag {fmtDate(stichtag)} · {zivis.filter((z) => z.isActive).length} aktiv · Dienstzeit 9 Monate, Dienstfreistellung 2 Werktage je vollem Monat (§ 23a ZDG), Verlängerung ab 24 Fehltagen (§ 21 ZDG)</div></div>
        <div className="flex gap-2 items-center">
          <form method="get" className="flex gap-1"><input type="date" name="stichtag" defaultValue={stichtag} className="inp mono" /><button className="btn" type="submit">Anzeigen</button></form>
          <Link href="/personal" className="btn ghost">← Personal</Link>
        </div>
      </div>

      <div className="panel">
        <div className="twrap"><table className="data">
          <thead><tr><th>Zivildiener</th><th>Dienstzeit</th><th>Fortschritt</th><th className="text-right">Freistellung Anspr./verbr./geplant/Rest</th><th className="text-right">Fehltage</th><th>Voraussichtl. Ende</th><th>Hinweise</th><th></th></tr></thead>
          <tbody>{zeilen.map(({ z, konto }) => (
            <tr key={z.id} style={z.isActive ? undefined : { opacity: .55 }}>
              <td><Link href={`/personal/${z.id}`} className="font-semibold hover:underline">{z.lastName} {z.firstName}</Link>{z.ziviBescheid ? <div className="text-[.65rem] text-muted mono">Bescheid {z.ziviBescheid}</div> : null}{!z.isActive ? <div className="text-[.65rem] text-muted">inaktiv</div> : null}</td>
              {konto ? <>
                <td className="mono text-xs">{fmtDate(konto.beginn)} – {fmtDate(konto.endeRegulaer)}</td>
                <td><div style={{ width: 110, height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.round(konto.fortschritt * 100)}%`, height: "100%", background: "var(--good)" }} /></div><div className="text-[.65rem] text-muted">{konto.tageGeleistet} / {konto.tageGesamt} Tage · {konto.volleMonate} volle Monate</div></td>
                <td className="mono text-right">{konto.urlaubAnspruch} / {konto.urlaubVerbraucht} / {konto.urlaubGeplant} / <b style={{ color: konto.urlaubRest < 0 ? "var(--bad)" : undefined }}>{konto.urlaubRest}</b></td>
                <td className="mono text-right"><span style={{ color: konto.verlaengerung ? "var(--bad)" : konto.fehltage >= 18 ? "var(--warn)" : undefined }}>{konto.fehltage}</span> / 24{konto.krankLaufend ? <span className="pill bad" style={{ marginLeft: 4 }}>krank</span> : null}</td>
                <td className="mono text-xs">{fmtDate(konto.endeVoraussichtlich)}{konto.verlaengerung ? <span className="pill warn" style={{ marginLeft: 4 }}>+{konto.verlaengerung} Tage</span> : ""}</td>
                <td className="text-xs">{konto.hinweise.map((h) => <div key={h.code} style={{ color: h.stufe === "WARN" ? "var(--warn)" : undefined }}>{h.text}</div>)}</td>
              </> : <td colSpan={6} className="text-xs" style={{ color: "var(--warn)" }}>Dienstantritt fehlt – im Personal-Datensatz unter „Zivildienst“ eintragen.</td>}
              <td><Link href={`/abwesenheiten/konto?staff=${z.id}`} className="btn ghost sm">Abwesenheiten →</Link></td>
            </tr>
          ))}
          {zeilen.length === 0 ? <tr><td colSpan={8}><div className="empty">Keine Zivildiener im Personal (Art „Zivildiener“).</div></td></tr> : null}</tbody>
        </table></div>
        <div className="p-3 text-[.72rem] text-muted">Fehltage = Kalendertage mit Krankenstand/Pflege/unbezahlt/sonstiger Verhinderung (Dienstfreistellung und Zeitausgleich zählen nicht) plus Fehltage aus einer früheren Einsatzstelle. Krankheit über drei Tage nur mit ärztlicher Bestätigung; Verlängerungen an die Zivildienstserviceagentur melden.</div>
      </div>
    </div>
  );
}
