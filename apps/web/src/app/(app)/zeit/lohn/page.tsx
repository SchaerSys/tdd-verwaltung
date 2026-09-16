import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeLohn } from "@/lib/lohn-daten";

export const dynamic = "force-dynamic";
const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/**
 * Lohnexport (P6): Monatszeile je Arbeitnehmer:in für die externe Lohnverrechnung – Vorschau
 * und Download als Excel/CSV. Nur Admin (SV-Nummern). Vormonat ist Vorgabe.
 */
export default async function LohnSeite({ searchParams }: { searchParams: Promise<{ monat?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const heute = new Date();
  const vormonat = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() - 1, 1));
  const m = /^(\d{4})-(\d{2})$/.exec(sp.monat ?? "");
  const jahr = m ? Number(m[1]) : vormonat.getUTCFullYear();
  const monat = m ? Number(m[2]) : vormonat.getUTCMonth() + 1;
  if (monat < 1 || monat > 12) redirect("/zeit/lohn");
  const param = `${jahr}-${String(monat).padStart(2, "0")}`;
  const zeilen = await ladeLohn(jahr, monat);
  const offen = zeilen.filter((z) => !z.abgeschlossen).length;
  const f = (n: number) => n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <div className="page-h">
        <div><h1>Lohnexport</h1><div className="sub">{MONATE[monat - 1]} {jahr} · {zeilen.length} Arbeitnehmer:innen{offen ? ` · ${offen} Monat(e) noch nicht abgeschlossen` : " · alle Monate abgeschlossen"}</div></div>
        <div className="flex gap-2 items-center flex-wrap">
          <form method="get" className="flex gap-1"><input type="month" name="monat" defaultValue={param} className="inp mono" /><button className="btn" type="submit">Anzeigen</button></form>
          <a href={`/zeit/lohn/export?monat=${param}`} className="btn primary">⬇ Excel</a>
          <a href={`/zeit/lohn/export?monat=${param}&format=csv`} className="btn ghost">⬇ CSV</a>
          <Link href={`/zeit/monat?monat=${param}`} className="btn ghost">Monatsauswertung</Link>
        </div>
      </div>

      {offen ? <div className="panel mb-3"><div className="p-3 text-[.8125rem]" style={{ color: "var(--warn)" }}>Für {offen} Person(en) ist der Monat noch nicht abgeschlossen – die Zahlen sind live und können sich durch Korrekturen noch ändern. Vor dem Versand an die Lohnverrechnung in der <Link href={`/zeit/monat?monat=${param}`}>Monatsauswertung</Link> abschließen.</div></div> : null}

      <div className="panel">
        <div className="twrap"><table className="data" style={{ fontSize: ".78rem" }}>
          <thead><tr><th>Person</th><th>SV-Nr.</th><th>Besch.</th><th className="text-right">Wo-Std</th><th className="text-right">Soll</th><th className="text-right">Ist</th><th className="text-right">Gutschr.</th><th className="text-right">Saldo</th><th className="text-right">Konto</th><th className="text-right">Mehrarb.</th><th className="text-right">Überst.</th><th className="text-right">Url. AT</th><th className="text-right">ZA AT</th><th className="text-right">Krank KT/AT</th><th className="text-right">Pflege</th><th className="text-right">Sonder</th><th className="text-right">Unbez.</th><th>Stand</th><th>Hinweis</th></tr></thead>
          <tbody>{zeilen.map((z) => (
            <tr key={z.personalNr}>
              <td><b>{z.nachname} {z.vorname}</b><div className="text-[.65rem] text-muted mono">{z.personalNr}{z.eintritt ? ` · ab ${z.eintritt}` : ""}{z.austritt ? ` · bis ${z.austritt}` : ""}</div></td>
              <td className="mono">{z.svNummer || <span style={{ color: "var(--bad)" }}>fehlt</span>}</td>
              <td className="text-xs">{z.beschaeftigung || "—"}</td>
              <td className="mono text-right">{z.wochenstunden || "—"}</td>
              <td className="mono text-right">{f(z.sollStd)}</td><td className="mono text-right">{f(z.istStd)}</td><td className="mono text-right">{z.gutschriftStd ? f(z.gutschriftStd) : ""}</td>
              <td className="mono text-right" style={{ color: z.saldoStd < 0 ? "var(--bad)" : undefined }}>{f(z.saldoStd)}</td>
              <td className="mono text-right" style={{ color: z.kontoStd < 0 ? "var(--bad)" : undefined }}>{f(z.kontoStd)}</td>
              <td className="mono text-right">{z.mehrarbeitStd ? f(z.mehrarbeitStd) : ""}</td><td className="mono text-right">{z.ueberstundenStd ? f(z.ueberstundenStd) : ""}</td>
              <td className="mono text-right">{z.urlaubTage || ""}</td><td className="mono text-right">{z.zeitausgleichTage || ""}</td>
              <td className="mono text-right">{z.krankKalendertage ? `${z.krankKalendertage} / ${z.krankArbeitstage}` : ""}</td>
              <td className="mono text-right">{z.pflegeTage || ""}</td><td className="mono text-right">{z.sonderurlaubTage || ""}</td><td className="mono text-right">{z.unbezahltTage || ""}</td>
              <td>{z.abgeschlossen ? <span className="pill good">🔒</span> : <span className="pill warn">offen</span>}</td>
              <td className="text-xs" style={{ color: z.hinweis ? "var(--warn)" : undefined }}>{z.hinweis}</td>
            </tr>
          ))}
          {zeilen.length === 0 ? <tr><td colSpan={19}><div className="empty">Keine Arbeitnehmer:innen im Personal (Zivildiener und Ehrenamtliche sind nicht Teil des Lohnexports).</div></td></tr> : null}</tbody>
        </table></div>
        <div className="p-3 text-[.72rem] text-muted">Stunden dezimal; AT = Arbeitstage laut Wochenverteilung, KT = Kalendertage. Krankenstand als Kalendertage für die Entgeltfortzahlung (EFZG), Arbeitstage zur Kontrolle. Bei abgeschlossenen Monaten kommen die Zahlen aus dem festen Abschluss (§ 26 AZG). Kein Gehalt im Export – das führt die Lohnverrechnung. Jeder Download wird protokolliert.</div>
      </div>
    </div>
  );
}
