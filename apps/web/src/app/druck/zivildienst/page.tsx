import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { abwesenheiten, locations, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PrintButton } from "@/components/PrintButton";
import { freieTage } from "@/lib/abwesenheit-daten";
import { ladeRegeln } from "@/lib/azg-daten";
import { zivildienstKonto } from "@/lib/zivildienst";
import { ABW_ART_LABEL } from "@/lib/abwesenheit";
import { heuteIso } from "@/lib/touren";
import { fmtDate } from "@/lib/format";

/** Dienstzeit-/Abwesenheitsbestätigung für die Zivildienstserviceagentur – /druck/zivildienst?staff=<id>. */
export default async function ZiviDruck({ searchParams }: { searchParams: Promise<{ staff?: string; stichtag?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const sp = await searchParams;
  if (!sp.staff) redirect("/personal/zivildienst");
  const stichtag = /^\d{4}-\d{2}-\d{2}$/.test(sp.stichtag ?? "") ? sp.stichtag! : heuteIso();
  const [rows, regeln] = await Promise.all([
    db().select({ p: staff, ort: locations.name }).from(staff).leftJoin(locations, eq(locations.id, staff.locationId)).where(eq(staff.id, sp.staff)).limit(1),
    ladeRegeln(),
  ]);
  const row = rows[0];
  if (!row) notFound();
  const p = row.p;
  const beginn = p.ziviBeginn ?? p.employmentStart;
  if (!beginn) redirect("/personal/zivildienst");
  const jahr = Number(stichtag.slice(0, 4));
  const [abw, frei] = await Promise.all([db().select().from(abwesenheiten).where(eq(abwesenheiten.staffId, p.id)), freieTage([jahr - 1, jahr, jahr + 1])]);
  const k = zivildienstKonto({ beginn, ende: p.ziviEnde, fehltageVor: p.ziviFehltageVor }, abw, frei, stichtag, regeln.ziviFreistellungMonat);
  const fehl = abw.filter((a) => a.status === "GENEHMIGT" && !["URLAUB", "ZEITAUSGLEICH", "SONDERURLAUB"].includes(a.art) && a.bis >= k.beginn && a.von <= stichtag).sort((a, b) => a.von.localeCompare(b.von));
  const frei2 = abw.filter((a) => a.status === "GENEHMIGT" && a.art === "URLAUB" && a.bis >= k.beginn).sort((a, b) => a.von.localeCompare(b.von));

  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh" }}>
      <div className="no-print" style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/personal/zivildienst" className="btn ghost">← Zivildienst</Link>
        <form method="get" className="flex gap-1"><input type="hidden" name="staff" value={p.id} /><input type="date" name="stichtag" defaultValue={stichtag} className="inp mono" /><button className="btn" type="submit">Stichtag</button></form>
        <span style={{ marginLeft: "auto" }}><PrintButton /></span>
      </div>
      <div className="zv">
        <div className="kopf"><div><b>{regeln.arbeitgeberName}</b><br />{regeln.arbeitgeberAnschrift ?? ""}</div><div style={{ textAlign: "right" }}>Einsatzstelle{row.ort ? `: ${row.ort}` : ""}<br />Stand {fmtDate(stichtag)}</div></div>
        <h1>Bestätigung über den Zivildienst</h1>
        <div className="meta">für die Zivildienstserviceagentur · Zivildienstgesetz (ZDG)</div>
        <table>
          <tbody>
            <tr><th>Zivildienstleistender</th><td>{p.firstName} {p.lastName}{p.geburtsdatum ? `, geboren ${fmtDate(p.geburtsdatum)}` : ""}</td></tr>
            <tr><th>Zuweisungsbescheid</th><td>{p.ziviBescheid ?? "—"}</td></tr>
            <tr><th>Dienstantritt</th><td>{fmtDate(k.beginn)}</td></tr>
            <tr><th>Reguläres Dienstende</th><td>{fmtDate(k.endeRegulaer)}</td></tr>
            <tr><th>Wochendienstzeit</th><td>{p.weeklyHours ? `${p.weeklyHours} h` : "—"} (Vorgabe {regeln.ziviWocheMinMin / 60}–{regeln.zivi.maxWocheMin / 60} h)</td></tr>
            <tr><th>Geleistete Dienstzeit bis Stichtag</th><td>{k.tageGeleistet} Kalendertage ({k.volleMonate} volle Monate)</td></tr>
            <tr><th>Fehltage (Verhinderung)</th><td>{k.fehltage} Kalendertage{p.ziviFehltageVor ? ` (davon ${p.ziviFehltageVor} aus früherer Einsatzstelle)` : ""}{k.verlaengerung ? ` – Verlängerung um ${k.verlaengerung} Tag(e), voraussichtliches Ende ${fmtDate(k.endeVoraussichtlich)} (§ 21 ZDG)` : " – keine Verlängerung"}</td></tr>
            <tr><th>Dienstfreistellung (§ 23a ZDG)</th><td>Anspruch {k.urlaubAnspruch} Werktage · verbraucht {k.urlaubVerbraucht} · genehmigt geplant {k.urlaubGeplant} · <b>Rest {k.urlaubRest}</b></td></tr>
          </tbody>
        </table>
        {fehl.length ? <><h2>Verhinderungen</h2><table><thead><tr><th>Von</th><th>Bis</th><th>Art</th><th>Bestätigung</th></tr></thead><tbody>{fehl.map((a) => <tr key={a.id}><td>{fmtDate(a.von)}</td><td>{fmtDate(a.bis)}</td><td>{ABW_ART_LABEL[a.art]}</td><td>{a.art === "KRANK" ? (a.bestaetigung ? "ärztliche Bestätigung liegt vor" : "ohne Bestätigung") : ""}</td></tr>)}</tbody></table></> : null}
        {frei2.length ? <><h2>Dienstfreistellungen</h2><table><thead><tr><th>Von</th><th>Bis</th><th>Werktage</th></tr></thead><tbody>{frei2.map((a) => <tr key={a.id}><td>{fmtDate(a.von)}</td><td>{fmtDate(a.bis)}</td><td>{a.halbtag ? "½" : ""}</td></tr>)}</tbody></table></> : null}
        <div className="unterschrift"><div>Ort, Datum</div><div>Einsatzstelle (Stempel, Unterschrift)</div></div>
      </div>
      <style>{`
        @page { size: A4; margin: 16mm; }
        .zv { max-width: 180mm; margin: 0 auto; padding: 18px 12px; font-size: 11.5px; }
        .zv .kopf { display: flex; justify-content: space-between; font-size: 10.5px; color: #333; margin-bottom: 18px; }
        .zv h1 { font-size: 19px; margin: 0 0 2px; }
        .zv h2 { font-size: 12.5px; margin: 16px 0 4px; }
        .zv .meta { color: #555; margin-bottom: 12px; }
        .zv table { width: 100%; border-collapse: collapse; }
        .zv th, .zv td { padding: 5px 6px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
        .zv tbody th { width: 38%; font-weight: 600; color: #333; }
        .zv thead th { font-size: 10px; text-transform: uppercase; color: #555; }
        .zv .unterschrift { margin-top: 48px; display: flex; gap: 40px; }
        .zv .unterschrift div { flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; color: #555; }
      `}</style>
    </div>
  );
}
