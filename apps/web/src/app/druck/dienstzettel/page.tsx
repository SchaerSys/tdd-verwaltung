import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { staff, locations, zeitRegeln } from "@tdd/db";
import { db } from "@/lib/db";
import { currentTenantId } from "@tdd/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PrintButton } from "@/components/PrintButton";
import { fmtDate } from "@/lib/format";
import { sollJeWochentag, type Verteilung } from "@/lib/azg";
import { arbeitstageProWoche } from "@/lib/abwesenheit";
import { BESCHAEFTIGUNG_LABEL } from "@/lib/personalakte";
import { WOCHENTAGE_KURZ } from "@/lib/touren";
import { mandant } from "@/lib/mandant";

/**
 * Dienstzettel nach § 2 AVRAG zum Ausdrucken – /druck/dienstzettel?staff=<id>.
 * Enthält die Mindestangaben des § 2 Abs 2 in der Fassung 2024 (Probezeit, Sitz,
 * Überstundenvergütung, SV-Träger, Fortbildung). Ersetzt keinen Dienstvertrag;
 * unterschrieben wird er als Dokument in der Personalakte abgelegt.
 */
export default async function DienstzettelDruck({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "staff:manage") || !hasPermission(user.role, "admin:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const m = await mandant();
  if (!sp.staff) redirect("/personal");

  const [rows, regelnRows] = await Promise.all([
    db().select({ p: staff, ort: locations.name, ortStrasse: locations.strasse, ortPlz: locations.plz, ortOrt: locations.city })
      .from(staff).leftJoin(locations, eq(locations.id, staff.locationId)).where(eq(staff.id, sp.staff)).limit(1),
    db().select().from(zeitRegeln).where(eq(zeitRegeln.tenantId, currentTenantId())).limit(1),
  ]);
  const row = rows[0];
  if (!row) notFound();
  const p = row.p;
  const r = regelnRows[0];
  const soll = sollJeWochentag((p.sollVerteilung as Verteilung | null) ?? null, p.weeklyHours ? Number(p.weeklyHours) : null);
  const wochenMin = Object.values(soll).reduce((a, b) => a + b, 0);
  const arbeitstage = arbeitstageProWoche(soll);
  const urlaubTage = p.urlaubWochen * arbeitstage;
  const fehlt = <span className="fehlt">— nicht erfasst —</span>;
  const dienstort = row.ort ? `${row.ort}${row.ortStrasse ? `, ${row.ortStrasse}` : ""}${row.ortPlz || row.ortOrt ? `, ${row.ortPlz ?? ""} ${row.ortOrt ?? ""}`.trimEnd() : ""}` : null;

  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh" }}>
      <div className="no-print" style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", gap: 12, alignItems: "center" }}>
        <Link href={`/personal/${p.id}`} className="btn ghost">← Personalakte</Link>
        <span style={{ fontSize: ".8rem", color: "#555" }}>Fehlende Angaben sind rot markiert – in der Personalakte ergänzen, dann neu drucken.</span>
        <Link href="/druck/datenschutz-personal" className="btn ghost">Datenschutzinformation</Link>
        <span style={{ marginLeft: "auto" }}><PrintButton /></span>
      </div>

      <div className="dz">
        <h1>Dienstzettel</h1>
        <div className="meta">gemäß § 2 AVRAG · ausgestellt am {fmtDate(p.dienstzettelAm ?? new Date().toISOString().slice(0, 10))}</div>

        <table>
          <tbody>
            <tr><th>1. Arbeitgeber (Name, Anschrift, Sitz)</th><td>{r?.arbeitgeberName ?? m.name}<br />{r?.arbeitgeberAnschrift ?? fehlt}</td></tr>
            <tr><th>2. Arbeitnehmer:in (Name, Anschrift)</th><td>{p.firstName} {p.lastName}<br />{p.strasse || p.plz || p.ort ? <>{p.strasse ?? ""}<br />{p.plz ?? ""} {p.ort ?? ""}</> : fehlt}<br /><span className="klein">geboren {p.geburtsdatum ? fmtDate(p.geburtsdatum) : "—"} · SV-Nr. {p.svNummer ?? "—"}</span></td></tr>
            <tr><th>3. Beginn des Arbeitsverhältnisses</th><td>{p.employmentStart ? fmtDate(p.employmentStart) : fehlt}</td></tr>
            <tr><th>4. Dauer / Ende bei Befristung</th><td>{p.befristetBis ? `befristet bis ${fmtDate(p.befristetBis)}` : "unbefristet"}</td></tr>
            <tr><th>5. Probezeit</th><td>{p.probezeitBis ? `bis ${fmtDate(p.probezeitBis)} (§ 19 Abs 2 AngG: höchstens ein Monat)` : "keine"}</td></tr>
            <tr><th>6. Kündigungsfrist und -termin</th><td>{p.kuendigungsfrist ?? "gesetzlich (§ 20 AngG)"}</td></tr>
            <tr><th>7. Gewöhnlicher Arbeits-/Einsatzort</th><td>{dienstort ?? fehlt}{p.kannFahren ? <><br /><span className="klein">Fahrtätigkeit im Einzugsgebiet Vorarlberg (Abholung/Lieferung)</span></> : null}</td></tr>
            <tr><th>8. Einstufung (generelles Schema)</th><td>{p.kvEinstufung ?? fehlt}</td></tr>
            <tr><th>9. Vorgesehene Verwendung</th><td>{p.taetigkeit ?? fehlt}</td></tr>
            <tr><th>10. Anfangsbezug</th><td>{p.gehaltBrutto ? <>{Number(p.gehaltBrutto).toLocaleString("de-AT", { style: "currency", currency: "EUR" })} brutto monatlich{p.beschaeftigung === "TEILZEIT" || p.beschaeftigung === "GERINGFUEGIG" ? " (für das vereinbarte Ausmaß)" : ""}, 14× jährlich, fällig am Monatsletzten durch Überweisung.</> : fehlt}
              <br /><span className="klein">Überstunden/Mehrarbeit: Abgeltung laut Zeitkonto (Zeitausgleich) bzw. mit Zuschlag {r?.ueberstundenZuschlag ?? 50} % (Überstunden) / {r?.mehrarbeitZuschlag ?? 25} % (Mehrarbeit Teilzeit, § 19d AZG).</span></td></tr>
            <tr><th>11. Jährlicher Erholungsurlaub</th><td>{p.urlaubWochen} Wochen (§ 2 UrlG){arbeitstage ? ` = ${urlaubTage} Arbeitstage bei ${arbeitstage} Arbeitstagen je Woche` : ""}</td></tr>
            <tr><th>12. Vereinbarte Normalarbeitszeit</th><td>{p.beschaeftigung ? BESCHAEFTIGUNG_LABEL[p.beschaeftigung] + ", " : ""}{wochenMin > 0 ? <>{Math.round((wochenMin / 60) * 100) / 100} Stunden je Woche<br /><span className="klein">Verteilung: {[1, 2, 3, 4, 5, 6, 7].filter((t) => (soll[t] ?? 0) > 0).map((t) => `${WOCHENTAGE_KURZ[t]} ${Math.round(((soll[t] ?? 0) / 60) * 100) / 100} h`).join(", ")}</span></> : fehlt}</td></tr>
            <tr><th>13. Kollektivvertrag / Betriebsvereinbarung</th><td>{r?.kollektivvertrag ? <>{r.kollektivvertrag}{r.kvEinsicht ? <><br /><span className="klein">Einsichtnahme: {r.kvEinsicht}</span></> : null}</> : "Es kommt kein Kollektivvertrag zur Anwendung; es besteht keine Betriebsvereinbarung."}</td></tr>
            <tr><th>14. Betriebliche Vorsorgekasse</th><td>{r?.bvKasse ?? fehlt}</td></tr>
            <tr><th>15. Sozialversicherungsträger</th><td>{r?.svTraeger ?? "Österreichische Gesundheitskasse (ÖGK)"}</td></tr>
            <tr><th>16. Fortbildung</th><td>Erforderliche Unterweisungen (Arbeitnehmer:innenschutz, Lebensmittelhygiene) erfolgen während der Arbeitszeit auf Kosten des Arbeitgebers.</td></tr>
          </tbody>
        </table>

        <p className="klein" style={{ marginTop: 14 }}>Dieser Dienstzettel ist eine schriftliche Aufzeichnung der wesentlichen Rechte und Pflichten aus dem Arbeitsvertrag (§ 2 Abs 1 AVRAG). Änderungen werden unverzüglich schriftlich mitgeteilt. Die Datenschutzinformation für Mitarbeitende wurde ausgehändigt.</p>

        <div className="unterschrift">
          <div>Ort, Datum · Arbeitgeber</div>
          <div>Ort, Datum · Arbeitnehmer:in (Empfang bestätigt)</div>
        </div>
      </div>

      <style>{`
        @page { size: A4; margin: 16mm; }
        .dz { max-width: 180mm; margin: 0 auto; padding: 18px 12px; font-size: 11.5px; }
        .dz h1 { font-size: 20px; margin: 0 0 2px; }
        .dz .meta { color: #555; margin-bottom: 14px; }
        .dz table { width: 100%; border-collapse: collapse; }
        .dz th, .dz td { padding: 5px 6px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
        .dz th { width: 38%; font-weight: 600; color: #333; }
        .dz .klein { font-size: 10px; color: #555; }
        .dz .fehlt { color: #a00; font-weight: 600; }
        .dz .unterschrift { margin-top: 48px; display: flex; gap: 40px; }
        .dz .unterschrift div { flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; color: #555; }
        @media print { .fehlt { color: #a00; } }
      `}</style>
    </div>
  );
}
