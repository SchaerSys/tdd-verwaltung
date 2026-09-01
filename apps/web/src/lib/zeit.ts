// Reine Zeiterfassungs-Logik (AZG-konform). Ohne DB/Framework → unit-testbar.

export type EventKind = "IN" | "OUT" | "BREAK_START" | "BREAK_END";
export type Status = "OUT" | "IN" | "BREAK";

export const KIND_LABEL: Record<EventKind, string> = {
  IN: "Kommen", OUT: "Gehen", BREAK_START: "Pause Beginn", BREAK_END: "Pause Ende",
};
export const STATUS_LABEL: Record<Status, string> = {
  OUT: "abgemeldet", IN: "angemeldet", BREAK: "in Pause",
};

/** Aktueller Status aus dem zuletzt erfassten Ereignis. */
export function statusFromLast(lastKind: EventKind | null | undefined): Status {
  if (lastKind === "IN" || lastKind === "BREAK_END") return "IN";
  if (lastKind === "BREAK_START") return "BREAK";
  return "OUT";
}

/** Welche Stempel-Aktionen sind im aktuellen Status sinnvoll/erlaubt? */
export function allowedActions(status: Status): EventKind[] {
  if (status === "OUT") return ["IN"];
  if (status === "IN") return ["BREAK_START", "OUT"];
  return ["BREAK_END"]; // BREAK
}

export interface Ev { kind: EventKind; at: string | Date }

/** Netto-Arbeitszeit und Pausenzeit (Minuten) aus einer Ereignisfolge eines Tages. */
export function dayTotals(events: Ev[], now: Date = new Date()): { workedMin: number; breakMin: number; open: boolean } {
  const evs = [...events].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  let worked = 0, brk = 0;
  let workingSince: number | null = null, breakSince: number | null = null, open = false;
  for (const e of evs) {
    const t = +new Date(e.at);
    if (e.kind === "IN") { workingSince = t; }
    else if (e.kind === "BREAK_START") { if (workingSince != null) { worked += t - workingSince; workingSince = null; } breakSince = t; }
    else if (e.kind === "BREAK_END") { if (breakSince != null) { brk += t - breakSince; breakSince = null; } workingSince = t; }
    else if (e.kind === "OUT") {
      if (workingSince != null) { worked += t - workingSince; workingSince = null; }
      if (breakSince != null) { brk += t - breakSince; breakSince = null; }
    }
  }
  const tnow = +now;
  if (workingSince != null) { worked += tnow - workingSince; open = true; }
  if (breakSince != null) { brk += tnow - breakSince; open = true; }
  return { workedMin: Math.max(0, Math.round(worked / 60000)), breakMin: Math.max(0, Math.round(brk / 60000)), open };
}

/** AZG-Hinweise für einen Arbeitstag (informativ). */
export function azgWarnings(workedMin: number, breakMin: number): string[] {
  const w: string[] = [];
  if (workedMin > 6 * 60 && breakMin < 30) w.push("Pause < 30 Min bei > 6 h Arbeitszeit (§ 11 AZG)");
  if (workedMin > 12 * 60) w.push("> 12 h Tagesarbeitszeit (§ 9 AZG)");
  return w;
}

/** Minuten als „H:MM h". */
export function fmtMin(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}:${String(m).padStart(2, "0")} h`;
}

/** Offset (Minuten, die die Zeitzone vor UTC liegt) für einen Zeitpunkt. */
function tzOffsetMin(date: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(date).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  const asUTC = Date.UTC(+(p.year ?? 0), +(p.month ?? 1) - 1, +(p.day ?? 1), +(p.hour ?? 0), +(p.minute ?? 0), +(p.second ?? 0));
  return (asUTC - date.getTime()) / 60000;
}

/** Wandelt eine Wiener Wanduhr-Zeit („YYYY-MM-DDTHH:MM") in den korrekten UTC-Zeitpunkt (DST-sicher). */
export function viennaLocalToUtc(local: string): Date {
  const [d, t] = local.split("T");
  const [Y, Mo, D] = (d ?? "").split("-").map((x) => parseInt(x, 10));
  const [H, Mi] = (t ?? "00:00").split(":").map((x) => parseInt(x, 10));
  const guess = Date.UTC(Y || 1970, (Mo || 1) - 1, D || 1, H || 0, Mi || 0);
  const off = tzOffsetMin(new Date(guess), "Europe/Vienna");
  return new Date(guess - off * 60000);
}

/** UTC-Zeitbereich [from, to) für einen Wiener Kalendertag („YYYY-MM-DD"). */
export function viennaDayRange(dateStr: string): { from: Date; to: Date } {
  const from = viennaLocalToUtc(`${dateStr}T00:00`);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}
