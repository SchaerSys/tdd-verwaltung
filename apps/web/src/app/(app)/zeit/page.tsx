import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { staff, timeEvents } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { dayTotals, azgWarnings, fmtMin, viennaDayRange, KIND_LABEL, statusFromLast, STATUS_LABEL, type EventKind, type Ev } from "@/lib/zeit";
import { addCorrection, deleteEvent } from "./actions";

function viennaToday(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p; // en-CA → YYYY-MM-DD
}
function shiftDay(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function timeHM(at: Date | string): string {
  return new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit" }).format(new Date(at));
}

export default async function ZeitPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");

  const { date: dRaw } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dRaw ?? "") ? dRaw! : viennaToday();
  const { from, to } = viennaDayRange(date);

  const [evs, people] = await Promise.all([
    db().select({ id: timeEvents.id, staffId: timeEvents.staffId, kind: timeEvents.kind, at: timeEvents.at, edited: timeEvents.edited, first: staff.firstName, last: staff.lastName })
      .from(timeEvents).innerJoin(staff, eq(staff.id, timeEvents.staffId))
      .where(and(gte(timeEvents.at, from), lt(timeEvents.at, to)))
      .orderBy(asc(staff.lastName), asc(timeEvents.at)),
    db().select({ id: staff.id, first: staff.firstName, last: staff.lastName }).from(staff).where(eq(staff.isActive, true)).orderBy(asc(staff.lastName)),
  ]);

  // Nach Mitarbeiter:in gruppieren.
  const byStaff = new Map<string, { name: string; events: typeof evs }>();
  for (const e of evs) {
    const g = byStaff.get(e.staffId) ?? { name: `${e.last}, ${e.first}`, events: [] as typeof evs };
    g.events.push(e); byStaff.set(e.staffId, g);
  }
  const month = date.slice(0, 7);
  const grandMin = [...byStaff.values()].reduce((sum, g) => sum + dayTotals(g.events as unknown as Ev[]).workedMin, 0);

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Zeiterfassung <span className="pill muted">A2</span></h1>
          <div className="sub">Tagesübersicht · {byStaff.size} Mitarbeiter:in{byStaff.size === 1 ? "" : "nen"} mit Buchungen</div>
        </div>
        <div className="flex gap-2">
          <a href="/stempeln" target="_blank" rel="noopener" className="btn">⏱ Stempel-Terminal</a>
          <a href={`/zeit/export?month=${month}`} className="btn ghost">⬇ Monats-Export</a>
        </div>
      </div>

      <div className="panel mb-4">
        <div className="panel-h" style={{ gap: 12 }}>
          <div className="flex gap-2 items-center">
            <Link href={`/zeit?date=${shiftDay(date, -1)}`} className="btn ghost sm">←</Link>
            <b className="mono">{new Date(`${date}T12:00:00Z`).toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</b>
            <Link href={`/zeit?date=${shiftDay(date, 1)}`} className="btn ghost sm">→</Link>
            {date !== viennaToday() ? <Link href="/zeit" className="btn ghost sm">Heute</Link> : null}
          </div>
        </div>

        {byStaff.size === 0 ? <div className="empty">Keine Buchungen an diesem Tag.</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Mitarbeiter:in</th><th>Kommt</th><th>Geht</th><th>Pause</th><th>Arbeitszeit</th><th>Buchungen</th></tr></thead>
            <tbody>
              {[...byStaff.entries()].map(([sid, g]) => {
                const t = dayTotals(g.events as unknown as Ev[]);
                const warns = azgWarnings(t.workedMin, t.breakMin);
                const firstIn = g.events.find((e) => e.kind === "IN");
                const lastOut = [...g.events].reverse().find((e) => e.kind === "OUT");
                const status = statusFromLast(g.events[g.events.length - 1]?.kind as EventKind | undefined);
                return (
                  <tr key={sid}>
                    <td><b>{g.name}</b>{t.open ? <span className="pill good" style={{ marginLeft: 8 }}><span className="dot" />{STATUS_LABEL[status]}</span> : null}</td>
                    <td className="mono">{firstIn ? timeHM(firstIn.at) : "—"}</td>
                    <td className="mono">{lastOut ? timeHM(lastOut.at) : (t.open ? "läuft" : "—")}</td>
                    <td className="mono">{t.breakMin ? fmtMin(t.breakMin) : "—"}</td>
                    <td className="mono"><b>{fmtMin(t.workedMin)}</b>{warns.length ? <div className="text-[.72rem]" style={{ color: "var(--warn)" }}>⚠ {warns.join(" · ")}</div> : null}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {g.events.map((e) => (
                          <span key={e.id} className="pill muted" title={e.edited ? "korrigiert" : e.kind}>
                            {KIND_LABEL[e.kind as EventKind]} {timeHM(e.at)}{e.edited ? " ✎" : ""}
                            <form action={deleteEvent} style={{ display: "inline" }}><input type="hidden" name="eventId" value={e.id} /><button className="ml-1" type="submit" title="Ereignis löschen" style={{ color: "var(--muted-2)", cursor: "pointer" }}>✕</button></form>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="total-row">
                <td colSpan={4}><b>Gesamt ({byStaff.size} {byStaff.size === 1 ? "Person" : "Personen"})</b></td>
                <td className="mono"><b>{fmtMin(grandMin)}</b></td>
                <td></td>
              </tr>
            </tbody>
          </table></div>
        )}
      </div>

      {/* Korrektur / Nacherfassung */}
      <div className="panel">
        <div className="panel-h"><h3>Korrektur / Nacherfassung</h3></div>
        <form action={addCorrection} className="p-4 flex flex-wrap gap-2 items-end">
          <div className="field"><label className="lbl">Mitarbeiter:in</label>
            <select name="staffId" className="inp" required defaultValue="">
              <option value="" disabled>— wählen —</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.last}, {p.first}</option>)}
            </select></div>
          <div className="field"><label className="lbl">Ereignis</label>
            <select name="kind" className="inp" defaultValue="IN">
              {(["IN", "OUT", "BREAK_START", "BREAK_END"] as EventKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select></div>
          <div className="field"><label className="lbl">Zeitpunkt (Wiener Zeit)</label><input type="datetime-local" name="at" className="inp mono" required defaultValue={`${date}T08:00`} /></div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}><label className="lbl">Notiz</label><input name="note" className="inp" placeholder="Grund der Korrektur" /></div>
          <button type="submit" className="btn primary">Erfassen</button>
        </form>
        <div className="p-4 pt-0 sub">Nacherfasste/korrigierte Buchungen werden mit ✎ markiert und protokolliert.</div>
      </div>
    </div>
  );
}
