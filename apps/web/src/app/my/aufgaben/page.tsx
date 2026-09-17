import { and, asc, desc, eq, isNull, isNotNull, or } from "drizzle-orm";
import { aufgaben } from "@tdd/db";
import { db } from "@/lib/db";
import { meinKontext } from "@/lib/my";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { aufgabeErledigen } from "../actions";

export const dynamic = "force-dynamic";

export default async function MyAufgaben() {
  const k = (await meinKontext())!;
  const mein = or(eq(aufgaben.staffId, k.person!.id), isNull(aufgaben.staffId));
  const [offen, erledigt] = await Promise.all([
    db().select().from(aufgaben).where(and(isNull(aufgaben.erledigtAm), mein)).orderBy(asc(aufgaben.faelligAm), desc(aufgaben.createdAt)),
    db().select().from(aufgaben).where(and(isNotNull(aufgaben.erledigtAm), mein)).orderBy(desc(aufgaben.erledigtAm)).limit(10),
  ]);
  const heute = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-3">
      <div className="panel">
        <div className="panel-h"><h3>Offen</h3><span className="pill muted">{offen.length}</span></div>
        <div className="p-3 flex flex-col gap-3">
          {offen.length === 0 ? <span className="text-sm text-muted">Nichts offen – super.</span> : offen.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-2">
              <div className="text-sm">
                <b>{a.prio === "HOCH" ? "❗ " : ""}{a.titel}</b>{a.staffId ? null : <span className="text-xs text-muted"> · für alle</span>}
                {a.beschreibung ? <div className="text-xs text-muted" style={{ whiteSpace: "pre-line" }}>{a.beschreibung}</div> : null}
                {a.faelligAm ? <div className="text-xs" style={{ color: a.faelligAm < heute ? "var(--bad)" : "var(--muted)" }}>bis {fmtDate(a.faelligAm)}{a.faelligAm < heute ? " – überfällig" : ""}</div> : null}
              </div>
              <form action={aufgabeErledigen}><input type="hidden" name="id" value={a.id} /><button className="btn sm" type="submit">✓ Erledigt</button></form>
            </div>
          ))}
        </div>
      </div>
      {erledigt.length ? (
        <div className="panel">
          <div className="panel-h"><h3>Zuletzt erledigt</h3></div>
          <div className="p-3 text-sm text-muted flex flex-col gap-1">{erledigt.map((a) => <div key={a.id}>✓ {a.titel} <span className="text-xs">· {fmtDateTime(a.erledigtAm)}</span></div>)}</div>
        </div>
      ) : null}
    </div>
  );
}
