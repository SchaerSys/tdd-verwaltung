import Link from "next/link";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { aufgaben } from "@tdd/db";
import { db } from "@/lib/db";
import { meinKontext, stempelStand } from "@/lib/my";
import { ladeZeitkontoWidget } from "@/lib/zeitkonto-widget";
import { ZeitkontoWidget } from "@/components/ZeitkontoWidget";
import { ladeMeineDienste } from "@/lib/dienstplan-daten";
import { plusTage, TAETIGKEIT_LABEL } from "@/lib/dienstplan";
import { heuteIso } from "@/lib/touren";
import { STATUS_LABEL } from "@/lib/zeit";
import { fmtDate } from "@/lib/format";
import { StempelKnoepfe } from "./stempeln/StempelKnoepfe";

export const dynamic = "force-dynamic";

export default async function MyHeute() {
  const k = (await meinKontext())!;
  const p = k.person!;
  const heute = heuteIso();
  const [widget, stand, dienste, offen] = await Promise.all([
    ladeZeitkontoWidget(k.user.id), stempelStand(p.id), ladeMeineDienste(p.id, heute, plusTage(heute, 6)),
    db().select().from(aufgaben).where(and(isNull(aufgaben.erledigtAm), or(eq(aufgaben.staffId, p.id), isNull(aufgaben.staffId)))).orderBy(asc(aufgaben.faelligAm)).limit(5),
  ]);
  const heutige = dienste.filter((d) => d.datum === heute);
  const zeit = (d: Date) => d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col gap-3">
      <div className="panel p-3">
        <div className="flex items-center justify-between">
          <div><div className="text-xs text-muted">Jetzt</div><b className="text-lg">{STATUS_LABEL[stand.status]}</b>{stand.seit ? <span className="text-xs text-muted"> seit {zeit(stand.seit)}</span> : null}</div>
          <Link href="/my/stempeln" className="btn primary">Stempeln</Link>
        </div>
        <div className="mt-2"><StempelKnoepfe status={stand.status} kompakt /></div>
      </div>
      {widget ? <div className="panel"><div className="panel-h"><h3>Mein Zeitkonto</h3></div><ZeitkontoWidget d={widget} kompakt /></div> : null}
      <div className="panel">
        <div className="panel-h"><h3>Heute</h3><span className="text-xs text-muted">{fmtDate(heute)}</span></div>
        <div className="p-3 text-sm">
          {heutige.length ? heutige.map((d) => <div key={d.id}><b>{d.von.slice(0, 5)}–{d.bis.slice(0, 5)}</b> · {d.ort ?? "—"} · {TAETIGKEIT_LABEL[d.taetigkeit] ?? d.taetigkeit}</div>) : <span className="text-muted">Kein Dienst eingeplant.</span>}
        </div>
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Offene Aufgaben</h3><Link href="/my/aufgaben" className="text-xs">alle →</Link></div>
        <div className="p-3 text-sm flex flex-col gap-1">
          {offen.length ? offen.map((a) => <div key={a.id}>{a.prio === "HOCH" ? "❗ " : ""}{a.titel}{a.faelligAm ? <span className="text-xs text-muted"> · bis {fmtDate(a.faelligAm)}</span> : null}</div>) : <span className="text-muted">Nichts offen.</span>}
        </div>
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Nächste Dienste</h3><Link href="/my/dienste" className="text-xs">alle →</Link></div>
        <div className="p-3 text-sm flex flex-col gap-1">
          {dienste.filter((d) => d.datum > heute).slice(0, 4).map((d) => <div key={d.id}><b>{fmtDate(d.datum)}</b> {d.von.slice(0, 5)}–{d.bis.slice(0, 5)} · {d.ort ?? "—"}</div>)}
          {dienste.filter((d) => d.datum > heute).length === 0 ? <span className="text-muted">Keine veröffentlichten Dienste.</span> : null}
        </div>
      </div>
      <Link href="/my/einstellungen" className="text-xs text-muted text-center">Benachrichtigungen &amp; App installieren</Link>
    </div>
  );
}
