// Einheitliche Datumsformatierung für die ganze App: strikt TT.MM.JJJJ.
// Reine Datums-Strings (YYYY-MM-DD) werden ohne Zeitzonen-Umrechnung geparst
// (kein Off-by-one). Zeitstempel werden in Europe/Vienna dargestellt.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formatiert ein Datum als „TT.MM.JJJJ". Leer/ungültig → „—". */
export function fmtDate(v: string | Date | null | undefined): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
  if (Number.isNaN(v.getTime())) return "—";
  return `${pad(v.getDate())}.${pad(v.getMonth() + 1)}.${v.getFullYear()}`;
}

/** Formatiert einen Zeitstempel als „TT.MM.JJJJ HH:MM" (Europe/Vienna). Leer/ungültig → „—". */
export function fmtDateTime(v: string | Date | null | undefined): string {
  if (v == null || v === "") return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("day")}.${g("month")}.${g("year")} ${g("hour")}:${g("minute")}`;
}
