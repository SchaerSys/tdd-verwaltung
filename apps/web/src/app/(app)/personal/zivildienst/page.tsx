import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { abwesenheiten, staff, ziviMeldungen } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { freieTage } from "@/lib/abwesenheit-daten";
import { ladeRegeln } from "@/lib/azg-daten";
import { zivildienstKonto, ziviMeldeliste, ziviPruefung } from "@/lib/zivildienst";
import { heuteIso } from "@/lib/touren";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { meldungErledigt } from "./actions";

export const dynamic = "force-dynamic";
const MELDUNG_LABEL: Record<string, string> = { DIENSTANTRITT: "Dienstantritt", KRANK: "Krankheit", VERLAENGERUNG: "Verlängerung", DIENSTENDE: "Dienstende" };

/**
 * Zivildienst-Übersicht nach ZISA-Vorgaben: Dienstzeit, Dienstfreistellung, Fehltage/Verlängerung,
 * Stammdaten-Prüfung (Wochendienstzeit in den Grenzen der Regeln) und Meldeliste an die Agentur.
 */
export default async function ZiviSeite({ searchParams }: { searchParams: Promise<{ stichtag?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const stichtag = /^\d{4}-\d{2}-\d{2}$/.test(sp.stichtag ?? "") ? sp.stichtag! : heuteIso();
  const heute = heuteIso();
  const [zivis, regeln] = await Promise.all([
    db().select().from(staff).where(eq(staff.staffType, "ZIVILDIENER")).orderBy(asc(staff.isActive), asc(staff.lastName)),
    ladeRegeln(),
  ]);
  const jahr = Number(stichtag.slice(0, 4));
  const ids = zivis.map((z) => z.id);
  const [abw, frei, erledigt] = ids.length ? await Promise.all([
    db().select().from(abwesenheiten).where(inArray(abwesenheiten.staffId, ids)),
    freieTage([jahr - 1, jahr, jahr + 1]),
    db().select().from(ziviMeldungen).where(inArray(ziviMeldungen.staffId, ids)),
  ]) : [[], new Set<string>(), []];
  const grenzen = { wocheMinMin: regeln.ziviWocheMinMin, wocheMaxMin: regeln.zivi.maxWocheMin };

  const zeilen = zivis.map((z) => {
    const beginn = z.ziviBeginn ?? z.employmentStart;
    const eintraege = abw.filter((a) => a.staffId === z.id);
    const konto = beginn ? zivildienstKonto({ beginn, ende: z.ziviEnde, fehltageVor: z.ziviFehltageVor }, eintraege, frei, stichtag, regeln.ziviFreistellungMonat) : null;
    const meldungen = konto && z.isActive ? ziviMeldeliste(konto, eintraege, heute).map((m) => ({ ...m, erledigt: erledigt.find((e) => e.staffId === z.id && e.art === m.art && e.bezug === m.bezug) ?? null })) : [];
    return { z, konto, stamm: ziviPruefung(z, grenzen), meldungen };
  });
  const offeneMeldungen = zeilen.reduce((a, r) => a + r.meldungen.filter((m) => !m.erledigt).length, 0);

  return (
    <div>
      <div className="page-h">
        <div><h1>Zivildienst</h1><div className="sub">Stichtag {fmtDate(stichtag)} · {zivis.filter((z) => z.isActive).length} aktiv · Wochendienstzeit {grenzen.wocheMinMin / 60}–{grenzen.wocheMaxMin / 60} h, Tag max. {regeln.zivi.maxTagMin / 60} h, Freistellung {regeln.ziviFreistellungMonat} Werktage je vollem Monat (<Link href="/zeit/regeln">Regeln</Link>){offeneMeldungen ? ` · ${offeneMeldungen} offene Meldung(en)` : ""}</div></div>
        <div className="flex gap-2 items-center">
          <form method="get" className="flex gap-1"><input type="date" name="stichtag" defaultValue={stichtag} className="inp mono" /><button className="btn" type="submit">Anzeigen</button></form>
          <Link href="/personal" className="btn ghost">← Personal</Link>
        </div>
      </div>

      <div className="panel mb-4">
        <div className="twrap"><table className="data">
          <thead><tr><th>Zivildiener</th><th>Dienstzeit</th><th>Fortschritt</th><th className="text-right">Freistellung Anspr./verbr./geplant/Rest</th><th className="text-right">Fehltage</th><th>Voraussichtl. Ende</th><th>Hinweise</th><th></th></tr></thead>
          <tbody>{zeilen.map(({ z, konto, stamm }) => (
            <tr key={z.id} style={z.isActive ? undefined : { opacity: .55 }}>
              <td><Link href={`/personal/${z.id}`} className="font-semibold hover:underline">{z.lastName} {z.firstName}</Link>{z.ziviBescheid ? <div className="text-[.65rem] text-muted mono">Bescheid {z.ziviBescheid}</div> : null}{z.weeklyHours ? <div className="text-[.65rem] text-muted">{z.weeklyHours} h/Woche</div> : null}{!z.isActive ? <div className="text-[.65rem] text-muted">inaktiv</div> : null}</td>
              {konto ? <>
                <td className="mono text-xs">{fmtDate(konto.beginn)} – {fmtDate(konto.endeRegulaer)}</td>
                <td><div style={{ width: 110, height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.round(konto.fortschritt * 100)}%`, height: "100%", background: "var(--good)" }} /></div><div className="text-[.65rem] text-muted">{konto.tageGeleistet} / {konto.tageGesamt} Tage · {konto.volleMonate} volle Monate</div></td>
                <td className="mono text-right">{konto.urlaubAnspruch} / {konto.urlaubVerbraucht} / {konto.urlaubGeplant} / <b style={{ color: konto.urlaubRest < 0 ? "var(--bad)" : undefined }}>{konto.urlaubRest}</b></td>
                <td className="mono text-right"><span style={{ color: konto.verlaengerung ? "var(--bad)" : konto.fehltage >= 18 ? "var(--warn)" : undefined }}>{konto.fehltage}</span> / 24{konto.krankLaufend ? <span className="pill bad" style={{ marginLeft: 4 }}>krank</span> : null}</td>
                <td className="mono text-xs">{fmtDate(konto.endeVoraussichtlich)}{konto.verlaengerung ? <span className="pill warn" style={{ marginLeft: 4 }}>+{konto.verlaengerung} Tage</span> : ""}</td>
                <td className="text-xs">{[...stamm, ...konto.hinweise].map((h) => <div key={h.code} style={{ color: h.stufe === "FEHLT" ? "var(--bad)" : h.stufe === "WARN" ? "var(--warn)" : undefined }}>{h.text}</div>)}</td>
              </> : <td colSpan={6} className="text-xs" style={{ color: "var(--warn)" }}>Dienstantritt fehlt – im Personal-Datensatz unter „Zivildienst“ eintragen.{stamm.filter((h) => h.code !== "ZIVI_BEGINN").map((h) => <div key={h.code}>{h.text}</div>)}</td>}
              <td className="flex flex-col gap-1"><Link href={`/abwesenheiten/konto?staff=${z.id}`} className="btn ghost sm">Abwesenheiten →</Link>{konto ? <a href={`/druck/zivildienst?staff=${z.id}`} target="_blank" className="btn ghost sm">🖨 Bestätigung</a> : null}</td>
            </tr>
          ))}
          {zeilen.length === 0 ? <tr><td colSpan={8}><div className="empty">Keine Zivildiener im Personal (Art „Zivildiener“).</div></td></tr> : null}</tbody>
        </table></div>
        <div className="p-3 text-[.72rem] text-muted">Fehltage = Kalendertage mit Krankenstand/Pflege/unbezahlt/sonstiger Verhinderung (Dienstfreistellung und Zeitausgleich zählen nicht) plus Fehltage aus einer früheren Einsatzstelle. Zeiterfassung und Dienstplan prüfen Zivis gegen die ZISA-Grenzen (Regeln); Mehrdienst geht als Zeitausgleich ins Zeitkonto, es gibt keine Mehrarbeit/Überstunden.</div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Meldungen an die Zivildienstserviceagentur</h3>{offeneMeldungen ? <span className="pill warn">{offeneMeldungen} offen</span> : <span className="pill good"><span className="dot" />nichts offen</span>}</div>
        <div className="twrap"><table className="data">
          <thead><tr><th>Zivildiener</th><th>Meldung</th><th>fällig ab</th><th>Stand</th><th></th></tr></thead>
          <tbody>{zeilen.flatMap(({ z, meldungen }) => meldungen.map((m) => (
            <tr key={`${z.id}-${m.art}-${m.bezug}`} style={m.erledigt ? { opacity: .6 } : undefined}>
              <td><b>{z.lastName} {z.firstName}</b></td>
              <td><span className="pill muted">{MELDUNG_LABEL[m.art] ?? m.art}</span> <span className="text-xs">{m.text}</span></td>
              <td className="mono text-xs">{fmtDate(m.faelligAb)}</td>
              <td className="text-xs">{m.erledigt ? <>gemeldet {fmtDateTime(m.erledigt.gemeldetAt)}{m.erledigt.notiz ? ` · ${m.erledigt.notiz}` : ""}</> : <span className="pill warn">offen</span>}</td>
              <td>
                <form action={meldungErledigt} className="flex gap-1 items-center">
                  <input type="hidden" name="staffId" value={z.id} /><input type="hidden" name="art" value={m.art} /><input type="hidden" name="bezug" value={m.bezug} />
                  {m.erledigt ? <><input type="hidden" name="zuruecknehmen" value="1" /><button className="btn ghost sm" type="submit">Wieder öffnen</button></> : <><input name="notiz" className="inp sm" placeholder="z. B. per Portal am …" style={{ width: 160 }} /><button className="btn sm" type="submit">Gemeldet ✓</button></>}
                </form>
              </td>
            </tr>
          )))}
          {offeneMeldungen === 0 && zeilen.every((r) => r.meldungen.length === 0) ? <tr><td colSpan={5}><div className="empty">Keine Meldungen fällig.</div></td></tr> : null}</tbody>
        </table></div>
        <div className="p-3 text-[.72rem] text-muted">Die Liste entsteht aus den Daten: Dienstantritt, jede Krankheit über drei Kalendertage (ärztliche Bestätigung), Verlängerung ab 24 Fehltagen, Dienstende 30 Tage davor. „Gemeldet“ vermerkt nur, dass es erledigt ist – die Meldung selbst läuft über das Portal der Agentur.</div>
      </div>
    </div>
  );
}
