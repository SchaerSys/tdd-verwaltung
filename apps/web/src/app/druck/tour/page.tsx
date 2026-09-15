import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { heuteIso, WOCHENTAGE, wochentag, zeitKurz } from "@/lib/touren";
import { ladeTouren } from "@/lib/touren-daten";
import { fmtDate } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

/**
 * Laufzettel je Tour (A4): Fahrer, Fahrzeug, Stopps mit Adresse, Telefon, Fenster und
 * Hinweisen, Felder fuer Kisten/kg und Unterschrift.
 *   /druck/tour?datum=2026-09-15     alle Touren des Tages
 *   /druck/tour?tour=<id>            eine Tour
 */
export default async function TourDruck({ searchParams }: { searchParams: Promise<{ datum?: string; tour?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(sp.datum ?? "") ? sp.datum! : heuteIso();
  const liste = sp.tour ? await ladeTouren({ id: sp.tour }) : (await ladeTouren({ datum })).filter((t) => t.status !== "AUSGEFALLEN");

  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh" }}>
      <div className="no-print" style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", gap: 12, alignItems: "center" }}>
        <Link href={`/touren?datum=${liste[0]?.datum ?? datum}`} className="btn ghost">← Disposition</Link>
        <span>{liste.length} Laufzettel</span>
        <span style={{ marginLeft: "auto" }}><PrintButton /></span>
      </div>
      {liste.length === 0 ? <div style={{ padding: 40 }}>Keine Touren.</div> : null}
      {liste.map((t, i) => (
        <section key={t.id} className={`lz${i === liste.length - 1 ? " letztes" : ""}`}>
          <div className="kopf">
            <div><h1>{t.name}</h1><div className="meta">{WOCHENTAGE[wochentag(t.datum)]}, {fmtDate(t.datum)} · Start {zeitKurz(t.startzeit) || "—"}{t.start ? ` ab ${t.start}` : ""}</div></div>
            <div className="marke">Tischlein deck dich Vorarlberg</div>
          </div>
          <table className="info">
            <tbody>
              <tr><td>Fahrer:in</td><td><b>{t.fahrer ?? "________________"}</b>{t.beifahrer ? ` · Beifahrer:in ${t.beifahrer}` : ""}</td><td>Fahrzeug</td><td><b>{t.fahrzeug ?? "________________"}</b>{t.fahrzeugKuehlung ? " ❄" : ""}</td></tr>
              <tr><td>km Start</td><td>__________</td><td>km Ende</td><td>__________</td></tr>
            </tbody>
          </table>
          {t.hinweise ? <div className="hinweis">{t.hinweise}</div> : null}
          <table className="stopps">
            <thead><tr><th>#</th><th>Stopp</th><th>Adresse / Kontakt</th><th>Fenster</th><th>Kisten</th><th>kg</th><th>✓</th></tr></thead>
            <tbody>
              {t.stopps.map((s, j) => (
                <tr key={s.id}>
                  <td className="z">{j + 1}</td>
                  <td><b>{s.name}</b><div className="klein">{s.art === "LIEFERUNG" ? "Lieferung" : "Abholung"}{s.kuehlbedarf ? " · ❄ Kühlware" : ""}</div>{s.hinweis ? <div className="klein">{s.hinweis}</div> : null}{s.stellenHinweis ? <div className="klein">{s.stellenHinweis}</div> : null}</td>
                  <td>{s.adresse}<div className="klein">{s.ansprechperson ?? ""}{s.telefon ? ` · ${s.telefon}` : ""}</div></td>
                  <td className="z mono">{s.fenster ?? ""}</td>
                  <td className="feld"></td><td className="feld"></td><td className="feld"></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fuss"><span>Bemerkungen: ______________________________________________________________</span></div>
          <div className="unterschrift"><div>Fahrer:in</div><div>Übernahme Lager/Ausgabestelle</div></div>
        </section>
      ))}
      <style>{`
        @page { size: A4; margin: 12mm; }
        .lz { max-width: 190mm; margin: 0 auto; padding: 16px 12px; font-size: 11.5px; page-break-after: always; }
        .lz.letztes { page-break-after: auto; }
        .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #981313; padding-bottom: 6px; margin-bottom: 8px; }
        .lz h1 { font-size: 18px; margin: 0; } .meta { color: #555; } .marke { color: #981313; font-weight: 700; }
        .info { width: 100%; margin-bottom: 8px; } .info td { padding: 3px 6px; } .info td:nth-child(odd) { color: #555; width: 80px; }
        .hinweis { background: #fff6e0; border: 1px solid #e8c77a; padding: 6px 8px; margin-bottom: 8px; }
        .stopps { width: 100%; border-collapse: collapse; } .stopps th, .stopps td { border: 1px solid #bbb; padding: 5px 6px; vertical-align: top; text-align: left; }
        .stopps th { background: #f2f2f2; font-size: 10px; text-transform: uppercase; }
        .stopps td.z { text-align: center; } .stopps td.feld { width: 46px; height: 34px; }
        .klein { font-size: 10px; color: #555; }
        .fuss { margin-top: 14px; font-size: 11px; }
        .unterschrift { margin-top: 26px; display: flex; gap: 40px; } .unterschrift div { flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; color: #555; }
        .mono { font-family: ui-monospace, monospace; }
      `}</style>
    </div>
  );
}
