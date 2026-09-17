import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ladePortalAntraege, portalStatistik } from "@/lib/portal-daten";
import { PrintButton } from "@/components/PrintButton";
import { mandant } from "@/lib/mandant";

const MONATE = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/**
 * Statistik der eigenen Organisation – fuer Gemeinderat, Sozialausschuss, Traeger.
 * Nur die eigenen Antraege (RLS), keine Namen im Ausdruck.
 */
export default async function PortalStatistikSeite({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const sp = await searchParams;
  const m = await mandant();
  const heute = new Date();
  const jahr = /^\d{4}$/.test(sp.jahr ?? "") ? Number(sp.jahr) : heute.getFullYear();
  const user = await getCurrentUser();
  const orgId = user?.organizationId ?? 0;
  const liste = orgId ? await ladePortalAntraege(orgId) : [];
  const s = portalStatistik(liste, jahr);
  const institution = user?.organizationType === "INSTITUTION";
  const jahre = [...new Set([heute.getFullYear(), ...liste.map((a) => a.createdAt.getFullYear())])].sort((a, b) => b - a);
  const max = Math.max(1, ...s.monate.map((m) => m.gestellt));
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)} %`);

  return (
    <div className="statistik">
      <div className="page-h no-print">
        <div><h1>Statistik</h1><div className="sub">{user?.organizationName} · Anträge und Versorgung</div></div>
        <div className="flex gap-2 items-center">
          <form method="get" className="flex gap-1">
            <select name="jahr" defaultValue={String(jahr)} className="inp">{jahre.map((j) => <option key={j} value={j}>{j}</option>)}</select>
            <button className="btn" type="submit">Anzeigen</button>
          </form>
          <PrintButton />
          <Link href="/portal" className="btn ghost">← Start</Link>
        </div>
      </div>

      <div className="print-only" style={{ display: "none" }}>
        <h1 style={{ margin: 0 }}>{user?.organizationName}</h1>
        <div style={{ color: "#555", marginBottom: 12 }}>{m.kurzname} · Antrags-Statistik {jahr} · erstellt {heute.toLocaleDateString("de-AT")}</div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Zahl label={`Anträge ${jahr}`} v={s.gesamt} />
        <Zahl label="Positiv beschieden" v={s.positiv} sub={`${s.negativ} negativ · ${s.offen} offen`} />
        <Zahl label="Bewilligungsquote" v={pct(s.quote)} sub="Anteil positiv an entschiedenen" />
        <Zahl label="Ø Tage bis Bescheid" v={s.dauerTage ?? "—"} />
        <Zahl label="Versorgte Personen (Haushalte)" v={s.personenVersorgt} sub={`davon ${s.kinder} Kinder`} />
        <Zahl label="Aktuell mit aktiver Karte" v={s.aktuellVersorgt} sub="Stand heute, alle Jahre" />
        <Zahl label="Ausgabestelle" v={s.ausgabestelle} sub="positiv beschieden" />
        <Zahl label="Laden" v={s.laden} sub="positiv beschieden" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Anträge je Monat {jahr}</h3></div>
          <div className="p-4">
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {s.monate.map((m) => (
                <div key={m.monat} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }} title={`${MONATE[m.monat - 1]}: ${m.gestellt} gestellt, ${m.positiv} positiv`}>
                  <div style={{ width: "70%", height: `${(m.gestellt / max) * 100}%`, background: "var(--accent)", borderRadius: 3, minHeight: m.gestellt ? 3 : 0, opacity: .85 }} />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1">{MONATE.map((n) => <div key={n} className="flex-1 text-center text-[.65rem] text-muted">{n}</div>)}</div>
            <div className="twrap mt-3"><table className="data">
              <thead><tr><th>Monat</th><th className="text-right">gestellt</th><th className="text-right">positiv</th><th className="text-right">negativ</th></tr></thead>
              <tbody>{s.monate.filter((m) => m.gestellt).map((m) => (
                <tr key={m.monat}><td>{MONATE[m.monat - 1]}</td><td className="mono text-right">{m.gestellt}</td><td className="mono text-right">{m.positiv}</td><td className="mono text-right">{m.negativ}</td></tr>
              ))}
              {s.gesamt === 0 ? <tr><td colSpan={4}><div className="empty">Keine Anträge in {jahr}.</div></td></tr> : null}
              </tbody>
            </table></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>{institution ? "Wohnorte der Klient/innen" : "Wohnorte"} {jahr}</h3></div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Ort</th><th className="text-right">Anträge</th></tr></thead>
            <tbody>{s.orte.map((o) => <tr key={o.ort}><td>{o.ort}</td><td className="mono text-right">{o.n}</td></tr>)}
              {s.orte.length === 0 ? <tr><td colSpan={2}><div className="empty">—</div></td></tr> : null}
            </tbody>
          </table></div>
          <div className="p-4 text-[.72rem] text-muted">
            Grundlage: alle Anträge Ihrer Organisation mit Antragsdatum im Jahr {jahr}. „Aktuell mit aktiver Karte“ zählt über alle Jahre nach dem Stand bei TDD. Keine personenbezogenen Daten im Ausdruck.
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .statistik .print-only { display: block !important; }
          .statistik .panel { break-inside: avoid; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
    </div>
  );
}

function Zahl({ label, v, sub }: { label: string; v: number | string; sub?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[1.5rem] font-bold mono">{v}</div>
      <div className="text-[.75rem] text-muted">{label}</div>
      {sub ? <div className="text-[.68rem] text-muted mt-1">{sub}</div> : null}
    </div>
  );
}
