import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeMonat } from "@/lib/azg-daten";
import { ladeKonten } from "@/lib/abwesenheit-daten";
import { ladeMeineDienste } from "@/lib/dienstplan-daten";
import { dienstMinuten, plusTage, TAETIGKEIT_LABEL } from "@/lib/dienstplan";
import { freieTage } from "@/lib/abwesenheit-daten";
import { zivildienstKonto } from "@/lib/zivildienst";
import { ABW_ART_LABEL } from "@/lib/abwesenheit";
import { fmtMin, fmtSaldo } from "@/lib/zeit";
import { fmtDate } from "@/lib/format";
import { heuteIso, WOCHENTAGE_KURZ } from "@/lib/touren";
import { urlaubBeantragen, krankMelden, antragZurueckziehen } from "./actions";

export const dynamic = "force-dynamic";
const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/**
 * Mein Bereich (P1 Selbstservice): eigene Zeiten des Monats, Zeitkonto, Urlaubskonto,
 * eigene Abwesenheiten, Urlaub/Zeitausgleich beantragen, krank melden.
 * Braucht einen Personal-Datensatz, der mit dem Login verknüpft ist. Keine Klientendaten.
 */
export default async function MeinBereich({ searchParams }: { searchParams: Promise<{ monat?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "self:view")) redirect("/dashboard");
  const sp = await searchParams;
  const heute = heuteIso();
  const p = (await db().select().from(staff).where(eq(staff.userId, user.id)).limit(1))[0];

  if (!p) {
    return (
      <div>
        <div className="page-h"><div><h1>Mein Bereich</h1><div className="sub">{user.displayName}</div></div></div>
        <div className="panel"><div className="p-4 text-[.8125rem]">Dein Login ist noch mit keinem Personal-Datensatz verknüpft – deshalb gibt es hier noch keine Zeiten und kein Urlaubskonto. Bitte im Büro melden{hasPermission(user.role, "staff:manage") ? <> oder unter <Link href="/personal">Personal</Link> den eigenen Datensatz mit diesem Login verknüpfen</> : null}.</div></div>
      </div>
    );
  }

  const m = /^(\d{4})-(\d{2})$/.exec(sp.monat ?? "");
  const jahr = m ? Number(m[1]) : Number(heute.slice(0, 4));
  const monat = m ? Number(m[2]) : Number(heute.slice(5, 7));
  const monatParam = `${jahr}-${String(monat).padStart(2, "0")}`;
  const vor = new Date(Date.UTC(jahr, monat - 2, 1)); const nach = new Date(Date.UTC(jahr, monat, 1));
  const param = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const [zeit, konten, dienste] = await Promise.all([ladeMonat(jahr, monat, p.id), ladeKonten(heute, p.id), ladeMeineDienste(p.id, heute, plusTage(heute, 20))]);
  const z = zeit[0]; const k = konten[0];
  const ziviBeginn = p.staffType === "ZIVILDIENER" ? (p.ziviBeginn ?? p.employmentStart) : null;
  const zivi = ziviBeginn && k ? zivildienstKonto({ beginn: ziviBeginn, ende: p.ziviEnde, fehltageVor: p.ziviFehltageVor }, k.eintraege, await freieTage([jahr - 1, jahr, jahr + 1]), heute) : null;
  const offen = (k?.eintraege ?? []).filter((e) => e.status === "BEANTRAGT");
  const kommend = (k?.eintraege ?? []).filter((e) => e.status === "GENEHMIGT" && e.bis >= heute).sort((a, b) => a.von.localeCompare(b.von));

  return (
    <div>
      <div className="page-h">
        <div><h1>Mein Bereich</h1><div className="sub">{p.firstName} {p.lastName}{p.weeklyHours ? ` · ${p.weeklyHours} h/Woche` : ""}{p.employmentStart ? ` · seit ${fmtDate(p.employmentStart)}` : ""}</div></div>
        <Link href="/konto" className="btn ghost">Konto &amp; Passwort</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <div className="panel p-4"><div className="text-xs text-muted">Zeitkonto</div>{z ? <><b className="text-lg mono" style={{ color: z.kontoMin < 0 ? "var(--bad)" : "var(--good)" }}>{fmtSaldo(z.kontoMin)}</b><div className="text-xs text-muted">Stand Ende {MONATE[monat - 1]}</div></> : <span className="text-muted">—</span>}</div>
        <div className="panel p-4"><div className="text-xs text-muted">{MONATE[monat - 1]}: Ist / Soll</div>{z ? <><b className="text-lg mono">{fmtMin(z.auswertung.istMin)} / {fmtMin(z.auswertung.sollMin)}</b><div className="text-xs text-muted">Monat {fmtSaldo(z.auswertung.saldoMin)}{z.auswertung.gutschriftMin ? ` · Gutschrift ${fmtMin(z.auswertung.gutschriftMin)}` : ""}</div></> : <span className="text-muted">—</span>}</div>
        <div className="panel p-4"><div className="text-xs text-muted">{zivi ? "Dienstfreistellung übrig" : "Urlaub übrig"}</div>{zivi ? <><b className="text-lg mono" style={{ color: zivi.urlaubRest < 0 ? "var(--bad)" : undefined }}>{zivi.urlaubRest} Werktage</b><div className="text-xs text-muted">{zivi.volleMonate} volle Monate × 2 = {zivi.urlaubAnspruch} − verbraucht {zivi.urlaubVerbraucht} − geplant {zivi.urlaubGeplant} · Dienstende {fmtDate(zivi.endeVoraussichtlich)}</div></> : k?.urlaub ? <><b className="text-lg mono" style={{ color: k.urlaub.rest < 0 ? "var(--bad)" : undefined }}>{k.urlaub.rest} Tage</b><div className="text-xs text-muted">Anspruch {k.urlaub.anspruch} + Übertrag {k.urlaub.uebertrag} − verbraucht {k.urlaub.verbraucht} − geplant {k.urlaub.geplant}{k.urlaub.verfaelltDemnaechst ? ` · ${k.urlaub.verfaelltDemnaechst.tage} verfallen am ${fmtDate(k.urlaub.verfaelltDemnaechst.am)}` : ""}</div></> : <span className="text-muted text-xs">{k?.fehlt ?? "—"}</span>}</div>
        <div className="panel p-4"><div className="text-xs text-muted">{zivi ? "Fehltage (Zivildienst)" : "Krankenstand im Arbeitsjahr"}</div>{zivi ? <><b className="text-lg mono" style={{ color: zivi.verlaengerung ? "var(--bad)" : undefined }}>{zivi.fehltage} / 24</b><div className="text-xs text-muted">{zivi.verlaengerung ? `Verlängerung um ${zivi.verlaengerung} Tage` : `${zivi.fehltageFrei} Tage ohne Verlängerung frei`}</div></> : k?.krank ? <><b className="text-lg mono">{k.krank.tage} Tage</b><div className="text-xs text-muted">Entgeltfortzahlung voll noch {k.krank.restVollTage} Tage{k.krank.laufender ? " · derzeit krank" : ""}</div></> : <span className="text-muted">—</span>}</div>
      </div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Meine Dienste</h3><span className="text-xs text-muted">nächste drei Wochen · nur veröffentlichte Wochen</span></div>
        {dienste.length ? (
          <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[.8125rem]">
            {dienste.map((d) => (
              <div key={d.id} className="flex flex-col" style={d.datum === heute ? { background: "var(--warn-bg)", borderRadius: 6, padding: "4px 6px" } : { padding: "4px 6px" }}>
                <span><b>{WOCHENTAGE_KURZ[new Date(d.datum + "T00:00:00Z").getUTCDay() || 7]} {fmtDate(d.datum)}</b>{d.datum === heute ? " · heute" : ""}</span>
                <span className="mono">{d.von.slice(0, 5)}–{d.bis.slice(0, 5)}{d.pauseMin ? ` (${d.pauseMin} min Pause)` : ""} · {fmtMin(dienstMinuten(d))}</span>
                <span className="text-xs text-muted">{TAETIGKEIT_LABEL[d.taetigkeit]}{d.ort ? ` · ${d.ort}` : ""}{d.notiz ? ` · ${d.notiz}` : ""}</span>
              </div>
            ))}
          </div>
        ) : <div className="p-4 text-[.8125rem] text-muted">Für die nächsten Wochen ist noch kein Dienstplan veröffentlicht.</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3 items-start mb-4">
        <form action={urlaubBeantragen} className="panel">
          <div className="panel-h"><h3>Urlaub / Zeitausgleich beantragen</h3></div>
          <div className="p-4 grid gap-3 sm:grid-cols-2">
            <div className="field"><label className="lbl">Art</label><select name="art" className="inp"><option value="URLAUB">Urlaub</option><option value="ZEITAUSGLEICH">Zeitausgleich</option></select></div>
            <div className="field"><label className="lbl">Halber Tag</label><label className="flex items-center gap-2 text-[.8125rem] mt-2"><input type="checkbox" name="halbtag" /> nur ½ Tag (bei einem Tag)</label></div>
            <div className="field"><label className="lbl">Von</label><input name="von" type="date" className="inp mono" required min={heute} /></div>
            <div className="field"><label className="lbl">Bis</label><input name="bis" type="date" className="inp mono" min={heute} /></div>
            <div className="field sm:col-span-2"><label className="lbl">Bemerkung</label><input name="notiz" className="inp" placeholder="optional" /></div>
          </div>
          <div className="p-4 border-t border-[color:var(--border)]"><button className="btn primary" type="submit">Antrag abschicken</button><div className="text-[.72rem] text-muted mt-2">Das Büro genehmigt oder lehnt ab; bis dahin kannst du den Antrag hier zurückziehen.</div></div>
        </form>

        <form action={krankMelden} className="panel">
          <div className="panel-h"><h3>Krank melden</h3></div>
          <div className="p-4 grid gap-3 sm:grid-cols-2">
            <div className="field"><label className="lbl">Krank ab</label><input name="von" type="date" className="inp mono" defaultValue={heute} required /></div>
            <div className="field"><label className="lbl">Voraussichtlich bis</label><input name="bis" type="date" className="inp mono" /><div className="text-[.7rem] text-muted">leer = vorerst nur heute</div></div>
            <div className="field sm:col-span-2"><label className="lbl">Bemerkung</label><input name="notiz" className="inp" placeholder="optional – keine Diagnose nötig" /></div>
          </div>
          <div className="p-4 border-t border-[color:var(--border)]"><button className="btn" type="submit">Krankmeldung senden</button><div className="text-[.72rem] text-muted mt-2">Ab dem dritten Tag braucht das Büro eine ärztliche Bestätigung (§ 4 EFZG).</div></div>
        </form>

        <div className="panel">
          <div className="panel-h"><h3>Meine Abwesenheiten</h3>{offen.length ? <span className="pill warn">{offen.length} offen</span> : null}</div>
          <div className="p-3 flex flex-col gap-2 text-[.8125rem]">
            {offen.map((e) => (
              <div key={e.id} className="flex gap-2 items-center flex-wrap"><span className="pill warn">beantragt</span><span>{ABW_ART_LABEL[e.art]} {fmtDate(e.von)}{e.bis !== e.von ? ` – ${fmtDate(e.bis)}` : ""}{e.halbtag ? " ½" : ""}</span>
                <form action={antragZurueckziehen} style={{ marginLeft: "auto" }}><input type="hidden" name="id" value={e.id} /><button className="btn ghost sm" type="submit">Zurückziehen</button></form></div>
            ))}
            {kommend.map((e) => (
              <div key={e.id} className="flex gap-2 items-center"><span className={`pill ${e.art === "KRANK" ? "bad" : "good"}`}>{e.art === "KRANK" ? "krank" : "genehmigt"}</span><span>{ABW_ART_LABEL[e.art]} {fmtDate(e.von)}{e.bis !== e.von ? ` – ${fmtDate(e.bis)}` : ""}{e.halbtag ? " ½" : ""}</span></div>
            ))}
            {offen.length + kommend.length === 0 ? <div className="empty">Nichts offen, nichts geplant.</div> : null}
            {k?.urlaub ? <details className="mt-2"><summary className="text-xs text-muted cursor-pointer">Alle Einträge ({k.eintraege.length})</summary>
              <table className="data mt-2" style={{ fontSize: ".75rem" }}><tbody>{k.eintraege.map((e) => <tr key={e.id} style={e.status === "ABGELEHNT" ? { opacity: .5 } : undefined}><td>{ABW_ART_LABEL[e.art]}</td><td className="mono">{fmtDate(e.von)} – {fmtDate(e.bis)}</td><td className="text-muted">{e.status.toLowerCase()}</td></tr>)}</tbody></table></details> : null}
          </div>
        </div>
      </div>

      {z ? (
        <div className="panel">
          <div className="panel-h"><h3>Meine Zeiten – {MONATE[monat - 1]} {jahr}</h3>
            <span className="flex gap-1 items-center" style={{ marginLeft: "auto" }}><Link href={`/mein?monat=${param(vor)}`} className="btn ghost sm">‹</Link><Link href="/mein" className="btn ghost sm">heute</Link><Link href={`/mein?monat=${param(nach)}`} className="btn ghost sm">›</Link></span>
            {z.abschluss ? <span className="pill good">🔒 abgeschlossen</span> : null}
            <a href={`/druck/zeit?monat=${monatParam}&staff=${p.id}`} target="_blank" className="btn ghost sm">🖨</a>
          </div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Tag</th><th></th><th>Kommen</th><th>Gehen</th><th className="text-right">Pause</th><th className="text-right">Ist</th><th className="text-right">Soll</th><th>Gutschrift / Hinweis</th></tr></thead>
            <tbody>{z.auswertung.tage.map((t) => (
              <tr key={t.datum} style={t.wochentag >= 6 ? { color: "var(--muted)", background: "var(--surface-2)" } : t.datum === heute ? { background: "var(--warn-bg)" } : undefined}>
                <td className="mono">{t.datum.slice(8)}.</td><td>{WOCHENTAGE_KURZ[t.wochentag]}</td>
                <td className="mono">{t.kommen ?? ""}</td><td className="mono">{t.gehen ?? (t.offen ? "— offen —" : "")}</td>
                <td className="mono text-right">{t.breakMin ? fmtMin(t.breakMin) : ""}</td>
                <td className="mono text-right">{t.istMin ? fmtMin(t.istMin) : ""}</td>
                <td className="mono text-right">{t.sollMin ? fmtMin(t.sollMin) : ""}</td>
                <td className="text-xs">{t.gutschriftMin ? `${fmtMin(t.gutschriftMin)} ${t.gutschriftGrund}` : ""}{t.warnungen.filter((w) => w.code === "OFFEN").map((w) => <span key={w.code} style={{ color: "var(--bad)" }}>{w.text}</span>)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={5}><b>Summe</b></td><td className="mono text-right"><b>{fmtMin(z.auswertung.istMin)}</b></td><td className="mono text-right"><b>{fmtMin(z.auswertung.sollMin)}</b></td><td><b>Saldo {fmtSaldo(z.auswertung.saldoMin)}</b> · Konto {fmtSaldo(z.kontoMin)}</td></tr></tfoot>
          </table></div>
          <div className="p-3 text-[.72rem] text-muted">Fehlt ein Stempel oder stimmt eine Zeit nicht? Korrekturen macht das Büro mit Begründung – bitte melden. Feiertage, Urlaub und Krankenstand zählen als Gutschrift.</div>
        </div>
      ) : null}
    </div>
  );
}
