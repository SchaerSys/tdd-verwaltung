export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface Slot { from: string; to: string }
export type OpeningHours = Partial<Record<Weekday, Slot[]>>;

export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: "Mo", tue: "Di", wed: "Mi", thu: "Do", fri: "Fr", sat: "Sa", sun: "So",
};

const EN_TO_KEY: Record<string, Weekday> = {
  Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun",
};

/** Aktueller Wochentag + „HH:MM" in Europe/Vienna. */
function viennaNow(now: Date): { day: Weekday; hm: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: EN_TO_KEY[g("weekday")] ?? "mon", hm: `${g("hour")}:${g("minute")}` };
}

/** Normalisiert unbekannte Werte defensiv zu OpeningHours. */
export function asOpeningHours(v: unknown): OpeningHours {
  if (!v || typeof v !== "object") return {};
  const out: OpeningHours = {};
  for (const d of WEEKDAYS) {
    const arr = (v as Record<string, unknown>)[d];
    if (Array.isArray(arr)) {
      out[d] = arr
        .filter((s): s is Slot => !!s && typeof s === "object" && typeof (s as Slot).from === "string" && typeof (s as Slot).to === "string")
        .map((s) => ({ from: s.from, to: s.to }));
    }
  }
  return out;
}

/** Ist der Standort jetzt geöffnet? */
export function isOpenNow(oh: OpeningHours | null | undefined, now: Date = new Date()): boolean {
  if (!oh) return false;
  const { day, hm } = viennaNow(now);
  const slots = oh[day] ?? [];
  return slots.some((s) => s.from <= hm && hm < s.to);
}

/** Öffnungszeiten des heutigen Tages, z. B. „09:00–12:00". */
export function todayText(oh: OpeningHours | null | undefined, now: Date = new Date()): string {
  if (!oh) return "geschlossen";
  const { day } = viennaNow(now);
  const slots = oh[day] ?? [];
  if (!slots.length) return "geschlossen";
  return slots.map((s) => `${s.from}–${s.to}`).join(", ");
}

/** Hat der Standort überhaupt Öffnungszeiten hinterlegt? */
export function hasAnyHours(oh: OpeningHours | null | undefined): boolean {
  return !!oh && WEEKDAYS.some((d) => (oh[d]?.length ?? 0) > 0);
}
