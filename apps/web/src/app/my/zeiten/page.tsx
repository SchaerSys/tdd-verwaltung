import Link from "next/link";
import { meinKontext } from "@/lib/my";
import { ladeMonat } from "@/lib/azg-daten";
import { fmtMin, fmtSaldo } from "@/lib/zeit";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WT = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export default async function MyZeiten({ searchParams }: { searchParams: Promise<{ monat?: string }> }) {
  const k = (await meinKontext())!;
  const sp = await searchParams;
  const heute = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(sp.monat ?? "");
  const jahr = m ? Number(m[1]) : heute.getFullYear(); const monat = m ? Number(m[2]) : heute.getMonth() + 1;
  const vor = new Date(Date.UTC(jahr, monat - 2, 1)); const nach = new Date(Date.UTC(jahr, monat, 1));
  const param = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const z = (await ladeMonat(jahr, monat, k.person!.id))[0];
  const a = z?.auswertung;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Link href={`/my/zeiten?monat=${param(vor)}`} className="btn ghost sm">←</Link>
        <div className="flex-1 text-center"><b>{MONATE[monat - 1]} {jahr}</b></div>
        <Link href={`/my/zeiten?monat=${param(nach)}`} className="btn ghost sm">→</Link>
      </div>
      {a ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="panel p-3 text-center"><div className="text-xs text-muted">Ist</div><b className="mono">{fmtMin(a.istMin)}</b></div>
            <div className="panel p-3 text-center"><div className="text-xs text-muted">Soll</div><b className="mono">{fmtMin(a.sollMin)}</b></div>
            <div className="panel p-3 text-center"><div className="text-xs text-muted">Zeitkonto</div><b className="mono" style={{ color: z.kontoMin < 0 ? "var(--bad)" : "var(--good)" }}>{fmtSaldo(z.kontoMin)}</b></div>
          </div>
          <div className="panel">
            <div className="twrap"><table className="data" style={{ fontSize: ".85rem" }}>
              <thead><tr><th>Tag</th><th>Kommen</th><th>Gehen</th><th className="text-right">Ist</th><th className="text-right">Soll</th></tr></thead>
              <tbody>{a.tage.filter((t) => t.istMin > 0 || t.sollMin > 0 || t.gutschriftMin > 0).map((t) => (
                <tr key={t.datum} style={t.offen ? { color: "var(--warn)" } : undefined}>
                  <td>{WT[t.wochentag]} {fmtDate(t.datum).slice(0, 5)}{t.gutschriftGrund ? <span className="text-xs text-muted"> {t.gutschriftGrund}</span> : null}</td>
                  <td className="mono">{t.kommen ?? "—"}</td><td className="mono">{t.gehen ?? (t.offen ? "offen" : "—")}</td>
                  <td className="text-right mono">{fmtMin(t.istMin + t.gutschriftMin)}</td><td className="text-right mono">{fmtMin(t.sollMin)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
          {a.warnungen.length ? <div className="panel p-3 text-xs"><b>Hinweise:</b> {a.warnungen.slice(0, 5).map((w) => w.text).join(" · ")}</div> : null}
        </>
      ) : <div className="panel"><div className="empty">Keine Daten.</div></div>}
    </div>
  );
}
