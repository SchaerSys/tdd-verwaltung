import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { abholstellen } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeWareneingang } from "@/lib/wareneingang";
import { mandant, zeilen } from "@/lib/mandant";
import { PrintButton } from "@/components/PrintButton";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Bestaetigung ueber Warenspenden (Lebensmittel) je Abholstelle und Zeitraum – aus dem Wareneingang.
 * Hinweis im Dokument: steuerliche Abzugsfaehigkeit haengt vom Spendenbeguenstigungs-Status des
 * Vereins ab (§ 4a EStG, Liste des BMF); die Bestaetigung ersetzt keine Spendenbescheinigung
 * mit Betrag, weil Sachspenden hier ohne Wert erfasst werden.
 */
export default async function SpendeDruck({ searchParams }: { searchParams: Promise<{ abholstelle?: string; jahr?: string; von?: string; bis?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const id = Number(sp.abholstelle);
  const jahr = /^\d{4}$/.test(sp.jahr ?? "") ? Number(sp.jahr) : new Date().getFullYear();
  const von = /^\d{4}-\d{2}-\d{2}$/.test(sp.von ?? "") ? sp.von! : `${jahr}-01-01`;
  const bis = /^\d{4}-\d{2}-\d{2}$/.test(sp.bis ?? "") ? sp.bis! : `${jahr}-12-31`;
  const a = id ? (await db().select().from(abholstellen).where(eq(abholstellen.id, id)).limit(1))[0] : undefined;
  if (!a) return <div style={{ padding: 40 }}>Abholstelle nicht gefunden.</div>;
  const [m, w] = await Promise.all([mandant(), ladeWareneingang(von, bis)]);
  const st = w.stellen.find((s) => s.abholstelleId === a.id);
  const einzel = w.touren.filter((t) => t.stelle === a.name);
  const heute = fmtDate(new Date());
  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh", fontSize: 12.5, lineHeight: 1.5 }}>
      <style>{`@media print { .no-print { display: none } @page { size: A4; margin: 20mm } } .br { max-width: 720px; margin: 0 auto; padding: 24px } .br table { border-collapse: collapse; width: 100%; margin-top: 8px } .br td, .br th { border-bottom: 1px solid #ddd; padding: 4px 6px; text-align: left } .br th { font-size: 11px; text-transform: uppercase; color: #555 } .br .r { text-align: right }`}</style>
      <div className="no-print" style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", gap: 12, alignItems: "center" }}>
        <Link href={`/touren/abholstellen/${a.id}`} className="btn ghost">← Abholstelle</Link>
        <form method="get" className="flex gap-2 items-center"><input type="hidden" name="abholstelle" value={a.id} /><input type="date" name="von" defaultValue={von} className="inp mono" /><input type="date" name="bis" defaultValue={bis} className="inp mono" /><button className="btn sm" type="submit">Zeitraum</button></form>
        <span style={{ marginLeft: "auto" }}><PrintButton /></span>
      </div>
      <section className="br">
        <div style={{ textAlign: "right", color: "#555" }}><b style={{ color: "#111" }}>{m.name}</b>{zeilen(m.anschrift).map((z) => <div key={z}>{z}</div>)}{m.kontaktEmail ? <div>{m.kontaktEmail}</div> : null}</div>
        <div style={{ marginTop: 28 }}><b>{a.name}</b>{a.ansprechperson ? <div>z. H. {a.ansprechperson}</div> : null}{a.strasse ? <div>{a.strasse}</div> : null}{a.plz || a.ort ? <div>{[a.plz, a.ort].filter(Boolean).join(" ")}</div> : null}</div>
        <div style={{ textAlign: "right", marginTop: 16 }}>{zeilen(m.anschrift).slice(-1)[0]?.replace(/^A-?\d{4}\s*/, "") || ""}, {heute}</div>
        <h1 style={{ fontSize: 18, marginTop: 24 }}>Bestätigung über Warenspenden (Lebensmittel)</h1>
        <p>Wir bestätigen, dass <b>{a.name}</b> im Zeitraum <b>{fmtDate(von)} – {fmtDate(bis)}</b> Lebensmittel unentgeltlich an {m.name} übergeben hat. Die Waren wurden an bedürftige Menschen in unseren Ausgabestellen weitergegeben.</p>
        <table style={{ maxWidth: 420 }}><tbody>
          <tr><td>Abholungen</td><td className="r"><b>{st?.stopps ?? 0}</b></td></tr>
          <tr><td>Kisten gesamt</td><td className="r"><b>{st?.kisten ?? 0}</b></td></tr>
          <tr><td>Geschätztes Gewicht</td><td className="r"><b>ca. {Math.round(st?.kg ?? 0).toLocaleString("de-AT")} kg</b></td></tr>
        </tbody></table>
        {einzel.length ? (
          <details open><summary style={{ marginTop: 14, cursor: "pointer" }}>Einzelne Abholungen ({einzel.length})</summary>
            <table><thead><tr><th>Datum</th><th>Tour</th><th className="r">Kisten</th><th className="r">kg</th></tr></thead>
              <tbody>{einzel.map((t, i) => <tr key={i}><td>{fmtDate(t.datum)}</td><td>{t.tour}</td><td className="r">{t.kisten ?? "—"}</td><td className="r">{t.kg != null ? Math.round(t.kg) : "—"}</td></tr>)}</tbody></table>
          </details>
        ) : null}
        <p style={{ marginTop: 18 }}>Wir danken herzlich für die Unterstützung. Die Spenden ermöglichen es uns, Menschen in schwierigen Lebenslagen mit Lebensmitteln zu versorgen und gleichzeitig Lebensmittelverschwendung zu vermeiden.</p>
        <p style={{ color: "#666", fontSize: 11 }}>Hinweis: Diese Bestätigung dokumentiert Art und Menge der Sachspende ohne Wertangabe. Ob und in welcher Höhe die Spende steuerlich abzugsfähig ist, richtet sich nach § 4a EStG und dem Status des Empfängers in der Liste begünstigter Einrichtungen des BMF; eine Bewertung hat der Spender vorzunehmen.</p>
        <div style={{ marginTop: 44, borderTop: "1px solid #333", width: 260, paddingTop: 4 }}>{m.name}</div>
      </section>
    </div>
  );
}
