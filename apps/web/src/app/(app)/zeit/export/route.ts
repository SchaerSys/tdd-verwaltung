import ExcelJS from "exceljs";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { staff, timeEvents } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { dayTotals, azgWarnings, fmtMin, viennaLocalToUtc, viennaDayRange, type EventKind } from "@/lib/zeit";

const dayKey = (at: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
const hm = (at: Date | string) => new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit" }).format(new Date(at));

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) return new Response("Forbidden", { status: 403 });

  const raw = new URL(req.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit" }).format(new Date());
  const from = viennaLocalToUtc(`${month}-01T00:00`);
  // Monatsende = erster des Folgemonats (Wiener Zeit):
  const Y = parseInt(month.slice(0, 4), 10);
  const M = parseInt(month.slice(5, 7), 10);
  const nextMonth = M === 12 ? `${Y + 1}-01` : `${Y}-${String(M + 1).padStart(2, "0")}`;
  const toReal = viennaLocalToUtc(`${nextMonth}-01T00:00`);

  const evs = await db().select({ staffId: timeEvents.staffId, kind: timeEvents.kind, at: timeEvents.at, first: staff.firstName, last: staff.lastName })
    .from(timeEvents).innerJoin(staff, eq(staff.id, timeEvents.staffId))
    .where(and(gte(timeEvents.at, from), lt(timeEvents.at, toReal)))
    .orderBy(asc(staff.lastName), asc(staff.firstName), asc(timeEvents.at));

  // Gruppierung: Mitarbeiter:in → Tag → Ereignisse
  interface Row { kind: EventKind; at: Date | string }
  const byStaff = new Map<string, { name: string; days: Map<string, Row[]> }>();
  for (const e of evs) {
    const g = byStaff.get(e.staffId) ?? { name: `${e.last}, ${e.first}`, days: new Map<string, Row[]>() };
    const dk = dayKey(e.at);
    const arr = g.days.get(dk) ?? [];
    arr.push({ kind: e.kind as EventKind, at: e.at });
    g.days.set(dk, arr);
    byStaff.set(e.staffId, g);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "TDD-Verwaltung"; wb.created = new Date();
  const ws = wb.addWorksheet(`Zeiterfassung ${month}`);
  ws.columns = [
    { header: "Mitarbeiter:in", key: "name", width: 26 },
    { header: "Datum", key: "date", width: 12 },
    { header: "Kommt", key: "in", width: 8 },
    { header: "Geht", key: "out", width: 8 },
    { header: "Pause (Min)", key: "brk", width: 11 },
    { header: "Arbeitszeit", key: "hm", width: 12 },
    { header: "Stunden (dez.)", key: "dec", width: 14 },
    { header: "Hinweise", key: "warn", width: 40 },
  ];
  for (const [, g] of [...byStaff.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    let monthMin = 0;
    for (const dk of [...g.days.keys()].sort()) {
      const events = g.days.get(dk)!;
      const t = dayTotals(events, viennaDayRange(dk).to);
      const warns = azgWarnings(t.workedMin, t.breakMin);
      if (t.open) warns.unshift("offen (kein Gehen erfasst)");
      const firstIn = events.find((e) => e.kind === "IN");
      const lastOut = [...events].reverse().find((e) => e.kind === "OUT");
      monthMin += t.workedMin;
      ws.addRow({
        name: g.name, date: dk, in: firstIn ? hm(firstIn.at) : "", out: lastOut ? hm(lastOut.at) : "",
        brk: t.breakMin || "", hm: fmtMin(t.workedMin), dec: Math.round((t.workedMin / 60) * 100) / 100, warn: warns.join(" · "),
      });
    }
    const total = ws.addRow({ name: `Summe ${g.name}`, hm: fmtMin(monthMin), dec: Math.round((monthMin / 60) * 100) / 100 });
    total.font = { bold: true };
    ws.addRow({});
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="TDD-Zeiterfassung-${month}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
