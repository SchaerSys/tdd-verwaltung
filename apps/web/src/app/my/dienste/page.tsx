import { meinKontext } from "@/lib/my";
import { ladeMeineDienste } from "@/lib/dienstplan-daten";
import { plusTage, TAETIGKEIT_LABEL } from "@/lib/dienstplan";
import { heuteIso, WOCHENTAGE_KURZ, wochentag } from "@/lib/touren";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MyDienste() {
  const k = (await meinKontext())!;
  const heute = heuteIso();
  const dienste = await ladeMeineDienste(k.person!.id, heute, plusTage(heute, 27));
  const tage = [...new Set(dienste.map((d) => d.datum))];
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-muted px-2">Nächste vier Wochen · nur veröffentlichte Wochen</div>
      {tage.length === 0 ? <div className="panel"><div className="empty">Keine Dienste veröffentlicht.</div></div> : tage.map((t) => (
        <div key={t} className="panel">
          <div className="panel-h"><h3>{WOCHENTAGE_KURZ[wochentag(t)]} {fmtDate(t)}</h3>{t === heute ? <span className="pill good">heute</span> : null}</div>
          <div className="p-3 text-sm flex flex-col gap-1">
            {dienste.filter((d) => d.datum === t).map((d) => <div key={d.id}><b className="mono">{d.von.slice(0, 5)}–{d.bis.slice(0, 5)}</b> · {d.ort ?? "—"} · {TAETIGKEIT_LABEL[d.taetigkeit] ?? d.taetigkeit}{d.pauseMin ? ` · ${d.pauseMin} min Pause` : ""}{d.notiz ? <div className="text-xs text-muted">{d.notiz}</div> : null}</div>)}
          </div>
        </div>
      ))}
    </div>
  );
}
