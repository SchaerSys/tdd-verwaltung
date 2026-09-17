import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeMonatsbericht, monatName } from "@/lib/monatsbericht";
import { PrintButton } from "@/components/PrintButton";
import { mandant } from "@/lib/mandant";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
const eur = (n: number) => n.toLocaleString("de-AT", { style: "currency", currency: "EUR" });

/** Monatsbericht A4 (fuer Obmann/Vorstand): Ausgabe je Ausgabestelle, Klient:innen, Wareneingang, Schulden. */
export default async function MonatsberichtDruck({ searchParams }: { searchParams: Promise<{ monat?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "report:view")) redirect("/dashboard");
  const sp = await searchParams;
  const vormonat = new Date(); vormonat.setUTCDate(1); vormonat.setUTCMonth(vormonat.getUTCMonth() - 1);
  const monat = /^\d{4}-\d{2}$/.test(sp.monat ?? "") ? sp.monat! : `${vormonat.getUTCFullYear()}-${String(vormonat.getUTCMonth() + 1).padStart(2, "0")}`;
  const [b, m] = await Promise.all([ladeMonatsbericht(monat), mandant()]);
  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh", fontSize: 12 }}>
      <style>{`@media print { .no-print { display: none } @page { size: A4; margin: 15mm } } .mb { max-width: 780px; margin: 0 auto; padding: 20px } .mb table { border-collapse: collapse; width: 100%; margin-top: 8px } .mb td, .mb th { border-bottom: 1px solid #ddd; padding: 5px 6px; text-align: left } .mb th { font-size: 11px; text-transform: uppercase; color: #555 } .mb .r { text-align: right; font-variant-numeric: tabular-nums } .mb .sum td { font-weight: 700; border-top: 2px solid #333 } .mb h2 { font-size: 14px; margin: 18px 0 4px }`}</style>
      <div className="no-print" style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/auswertungen" className="btn ghost">← Auswertungen</Link>
        <form method="get" className="flex gap-2 items-center"><input type="month" name="monat" defaultValue={monat} className="inp mono" /><button className="btn sm" type="submit">Anzeigen</button></form>
        <span style={{ marginLeft: "auto" }}><PrintButton /></span>
      </div>
      <section className="mb">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><h1 style={{ margin: 0, fontSize: 20 }}>Monatsbericht {monatName(monat)}</h1><div style={{ color: "#555" }}>{fmtDate(b.von)} – {fmtDate(b.bis)}</div></div>
          <div style={{ textAlign: "right" }}><b>{m.name}</b><div style={{ color: "#555", fontSize: 11 }}>erstellt {fmtDateTime(new Date())}</div></div>
        </div>
        <h2>Lebensmittelausgabe</h2>
        <table><thead><tr><th>Ausgabestelle</th><th className="r">Ausgabetage</th><th className="r">Bezüge</th><th className="r">Einnahmen</th><th className="r">Neuer Ausstand</th></tr></thead>
          <tbody>{b.stellen.map((s) => <tr key={s.name}><td>{s.name}</td><td className="r">{s.tage}</td><td className="r">{s.personen}</td><td className="r">{eur(s.einnahmen)}</td><td className="r">{eur(s.ausstand)}</td></tr>)}
            <tr className="sum"><td>Gesamt</td><td className="r">{b.summe.tage}</td><td className="r">{b.summe.personen}</td><td className="r">{eur(b.summe.einnahmen)}</td><td className="r">{eur(b.summe.ausstand)}</td></tr></tbody></table>
        <h2>Klient:innen</h2>
        <table><tbody>
          <tr><td>Neu aufgenommen im Monat</td><td className="r"><b>{b.neuePersonen}</b></td></tr>
          <tr><td>Aktive Karten am Monatsende</td><td className="r"><b>{b.aktiveKarten}</b></td></tr>
          <tr><td>Offene Schulden (Stand heute)</td><td className="r"><b>{b.schulden.personen} Personen · {eur(b.schulden.offen)}</b></td></tr>
        </tbody></table>
        <h2>Wareneingang (Abholungen)</h2>
        <table><tbody>
          <tr><td>Kisten</td><td className="r"><b>{b.wareneingang.kisten}</b></td></tr>
          <tr><td>Geschätztes Gewicht</td><td className="r"><b>{Math.round(b.wareneingang.kg).toLocaleString("de-AT")} kg</b></td></tr>
          <tr><td>Abholungen / Touren</td><td className="r"><b>{b.wareneingang.abholungen} / {b.wareneingang.touren}</b></td></tr>
        </tbody></table>
        <p style={{ color: "#666", marginTop: 20, fontSize: 11 }}>Einnahmen = tatsächlich bezahlte Beträge (inkl. Schuldentilgung). Ausstand = im Monat neu entstandene Schulden. Wareneingang laut Eingaben der Fahrer:innen (kg geschätzt).</p>
      </section>
    </div>
  );
}
