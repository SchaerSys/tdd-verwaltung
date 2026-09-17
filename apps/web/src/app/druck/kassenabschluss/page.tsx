import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { ausgabeSitzungen, distributions, locations, persons, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import { mandant } from "@/lib/mandant";

export const dynamic = "force-dynamic";
const eur = (v: string | number | null | undefined) => v == null ? "—" : Number(v).toLocaleString("de-AT", { style: "currency", currency: "EUR" });

/**
 * Kassenabschluss (A4) je Ausgabe-Sitzung: Kopf, Summen (Einnahmen, Tilgung, neue Schulden,
 * gezaehlt, Differenz), Buchungsliste, Unterschriftsfelder. Ueber Strg+P als PDF speichern.
 */
export default async function KassenabschlussDruck({ searchParams }: { searchParams: Promise<{ sitzung?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "distribution:record")) redirect("/dashboard");
  const sp = await searchParams;
  const id = sp.sitzung ?? "";
  const s = id ? (await db().select({ s: ausgabeSitzungen, ort: locations.name, first: staff.firstName, last: staff.lastName }).from(ausgabeSitzungen)
    .innerJoin(locations, eq(locations.id, ausgabeSitzungen.locationId)).leftJoin(staff, eq(staff.id, ausgabeSitzungen.staffId)).where(eq(ausgabeSitzungen.id, id)).limit(1))[0] : undefined;
  if (!s) return <div style={{ padding: 40 }}>Sitzung nicht gefunden.</div>;
  const m = await mandant();
  const buchungen = await db().select({ at: distributions.distributedAt, due: distributions.amountDue, paid: distributions.amountPaid, art: distributions.buchungsart, name: persons.lastName, vor: persons.firstName, gruppe: persons.gruppe, nr: persons.ausgabeNumber })
    .from(distributions).innerJoin(persons, eq(persons.id, distributions.personId))
    .where(and(eq(distributions.sitzungId, s.s.id), gte(distributions.distributedAt, s.s.beginn), s.s.ende ? lte(distributions.distributedAt, s.s.ende) : undefined)).orderBy(desc(distributions.distributedAt));
  const einnahmen = buchungen.reduce((a, b) => a + Number(b.paid ?? 0), 0);
  const tilgung = buchungen.reduce((a, b) => a + Math.max(0, Number(b.paid ?? 0) - Math.max(0, Number(b.due ?? 0))), 0);
  const neueSchulden = buchungen.filter((b) => b.art === "AUSGABE").reduce((a, b) => a + Math.max(0, Number(b.due ?? 0) - Number(b.paid ?? 0)), 0);
  const gezaehlt = s.s.kasseGezaehlt != null ? Number(s.s.kasseGezaehlt) : null;
  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh", fontSize: 12 }}>
      <style>{`@media print { .no-print { display: none } @page { size: A4; margin: 15mm } } .ka { max-width: 780px; margin: 0 auto; padding: 20px } .ka table { border-collapse: collapse; width: 100% } .ka td, .ka th { border-bottom: 1px solid #ddd; padding: 4px 6px; text-align: left } .ka th { font-size: 11px; text-transform: uppercase; color: #555 } .ka .r { text-align: right; font-variant-numeric: tabular-nums } .ka .sum td { font-weight: 700; border-top: 2px solid #333 }`}</style>
      <div className="no-print" style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/admin/ausgabestation" className="btn ghost">← Ausgabestation</Link><span style={{ marginLeft: "auto" }}><PrintButton /></span>
      </div>
      <section className="ka">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><h1 style={{ margin: 0, fontSize: 20 }}>Kassenabschluss</h1><div style={{ color: "#555" }}>{s.ort} · {fmtDate(s.s.beginn)}</div></div>
          <div style={{ textAlign: "right" }}><b>{m.kurzname}</b><div style={{ color: "#555", fontSize: 11 }}>erstellt {fmtDateTime(new Date())}</div></div>
        </div>
        <table style={{ marginTop: 14 }}><tbody>
          <tr><td>Kasse / Person</td><td><b>{s.first ? `${s.first} ${s.last}` : "Büro"}</b></td><td>Sitzung</td><td>{fmtDateTime(s.s.beginn)} – {s.s.ende ? fmtDateTime(s.s.ende) : "läuft"}</td></tr>
          <tr><td>Ausgaben</td><td><b>{buchungen.filter((b) => b.art === "AUSGABE").length}</b></td><td>Beendet</td><td>{s.s.ordentlich ? "ordentlich" : "automatisch (nicht über „Ausgabe beenden“)"}</td></tr>
        </tbody></table>
        <table style={{ marginTop: 14, maxWidth: 420 }}><tbody>
          <tr><td>Einnahmen laut System</td><td className="r"><b>{eur(einnahmen)}</b></td></tr>
          <tr><td>davon Schuldentilgung</td><td className="r">{eur(tilgung)}</td></tr>
          <tr><td>neu entstandene Schulden</td><td className="r">{eur(neueSchulden)}</td></tr>
          <tr><td>Kasse gezählt</td><td className="r">{gezaehlt != null ? eur(gezaehlt) : "________"}</td></tr>
          <tr className="sum"><td>Differenz</td><td className="r" style={{ color: s.s.differenz && Number(s.s.differenz) !== 0 ? "#b00" : undefined }}>{s.s.differenz != null ? eur(s.s.differenz) : "________"}</td></tr>
          {s.s.uebergabeAn ? <tr><td>Übergabe an</td><td className="r">{s.s.uebergabeAn}</td></tr> : null}
          {s.s.notiz ? <tr><td>Bemerkung</td><td className="r">{s.s.notiz}</td></tr> : null}
        </tbody></table>
        <h3 style={{ marginTop: 18, fontSize: 13 }}>Buchungen</h3>
        <table><thead><tr><th>Zeit</th><th>Person</th><th>Gruppe/Nr.</th><th>Art</th><th className="r">Fällig</th><th className="r">Bezahlt</th></tr></thead>
          <tbody>{buchungen.map((b, i) => <tr key={i}><td>{fmtDateTime(b.at).slice(-5)}</td><td>{b.name}, {b.vor}</td><td>{b.gruppe ?? "—"} / {b.nr ?? "—"}</td><td>{b.art === "TILGUNG" ? "Schulden beglichen" : b.art === "ERLASS" ? "Erlass" : "Ausgabe"}</td><td className="r">{eur(b.due)}</td><td className="r">{eur(b.paid)}</td></tr>)}
            {buchungen.length === 0 ? <tr><td colSpan={6}>Keine Buchungen.</td></tr> : null}</tbody>
        </table>
        <div style={{ display: "flex", gap: 40, marginTop: 40 }}>
          <div style={{ flex: 1, borderTop: "1px solid #333", paddingTop: 4 }}>Kasse (Unterschrift)</div>
          <div style={{ flex: 1, borderTop: "1px solid #333", paddingTop: 4 }}>Übernahme / Büro (Unterschrift)</div>
        </div>
      </section>
    </div>
  );
}
