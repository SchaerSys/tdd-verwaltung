/**
 * Gesetzliche Feiertage in Oesterreich (Feiertagsruhegesetz, gelten in Vorarlberg alle).
 * Reine Funktion – bewegliche Feste ueber den Ostersonntag (Meeus/Jones/Butcher).
 * Karfreitag ist seit 2019 kein allgemeiner Feiertag mehr (persoenlicher Feiertag),
 * 24./31. Dezember sind KV-Sache – beides ueber „betriebsfreie Tage“ regelbar.
 */
export interface Feiertag { datum: string; name: string }

export function ostersonntag(jahr: number): Date {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (d: Date, tage: number) => new Date(d.getTime() + tage * 864e5);

export function feiertage(jahr: number): Feiertag[] {
  const o = ostersonntag(jahr);
  const fix = (m: number, t: number, name: string): Feiertag => ({ datum: `${jahr}-${String(m).padStart(2, "0")}-${String(t).padStart(2, "0")}`, name });
  return [
    fix(1, 1, "Neujahr"), fix(1, 6, "Heilige Drei Könige"),
    { datum: iso(plus(o, 1)), name: "Ostermontag" },
    fix(5, 1, "Staatsfeiertag"),
    { datum: iso(plus(o, 39)), name: "Christi Himmelfahrt" },
    { datum: iso(plus(o, 50)), name: "Pfingstmontag" },
    { datum: iso(plus(o, 60)), name: "Fronleichnam" },
    fix(8, 15, "Mariä Himmelfahrt"), fix(10, 26, "Nationalfeiertag"), fix(11, 1, "Allerheiligen"),
    fix(12, 8, "Mariä Empfängnis"), fix(12, 25, "Christtag"), fix(12, 26, "Stefanitag"),
  ].sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Schneller Zugriff: Datum -> Name. */
export function feiertagsKarte(jahre: number[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const j of jahre) for (const f of feiertage(j)) m.set(f.datum, f.name);
  return m;
}
