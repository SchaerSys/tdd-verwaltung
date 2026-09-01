// Urlaubsrestanspruch nach österr. Urlaubsgesetz (UrlG). Reiner, testbarer Port
// des ursprünglichen Rechners (Kalender-/Arbeitsjahr, Aliquotierung, Teilzeit).

const VOLLZEIT = 38.5;

export interface UrlaubInput {
  eintritt: string;                 // YYYY-MM-DD (Anstellungsdatum)
  stichtag: string;                 // YYYY-MM-DD (Stichtag bzw. Austritt je nach mode)
  wochenstunden: number;
  tageWoche: number;                // Arbeitstage pro Woche
  jahresWochen: 5 | 6;              // Jahresanspruch in Wochen
  urlaubsjahr: "kalender" | "arbeit";
  aliquot: "monat" | "tag";
  verbraucht: number;               // Stunden
  uebertrag: number;                // Stunden
  mode: "eintritt" | "austritt";
}

export interface UrlaubResult {
  ok: boolean;
  error?: string;
  ausmassPct: number;               // Beschäftigungsausmaß in %
  hProTag: number;                  // Stunden pro Urlaubstag
  jahresStd: number;
  jahresTage: number;
  jahrLabel: string;
  jjStart: string;                  // dd.mm.yyyy
  jjEnde: string;                   // dd.mm.yyyy
  anspruchStd: number;              // Anspruch laufendes Jahr
  basis: string;
  uebertrag: number;
  verbraucht: number;
  restStd: number;
  restTage: number;
  wochenstunden: number;
}

function d(s: string): Date | null {
  const p = String(s).split("-");
  if (p.length !== 3) return null;
  const dt = new Date(+p[0]!, +p[1]! - 1, +p[2]!);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
const addY = (dt: Date, n: number) => { const x = new Date(dt.getTime()); x.setFullYear(x.getFullYear() + n); return x; };
const addM = (dt: Date, n: number) => { const x = new Date(dt.getTime()); x.setMonth(x.getMonth() + n); return x; };
const tage = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
const monate = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
const fd = (dt: Date) => { const p = (v: number) => (v < 10 ? "0" : "") + v; return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`; };

const err = (m: string): UrlaubResult => ({
  ok: false, error: m, ausmassPct: 0, hProTag: 0, jahresStd: 0, jahresTage: 0, jahrLabel: "",
  jjStart: "", jjEnde: "", anspruchStd: 0, basis: "", uebertrag: 0, verbraucht: 0, restStd: 0, restTage: 0, wochenstunden: 0,
});

export function berechneUrlaub(i: UrlaubInput): UrlaubResult {
  const wStd = i.wochenstunden, wTage = i.tageWoche, wochen = i.jahresWochen;
  if (!(wStd > 0) || !(wTage > 0)) return err("Wochenstunden und Arbeitstage pro Woche müssen größer als 0 sein.");
  const hProTag = wStd / wTage;
  const jahresStd = wochen * wStd;
  const jahresTage = wochen * wTage;

  const E = d(i.eintritt), S = d(i.stichtag);
  if (!E || !S) return err("Bitte Eintritts- und Stichtagsdatum eingeben.");
  if (S < E) return err("Der Stichtag liegt vor dem Anstellungsdatum.");

  const proMonat = i.aliquot === "monat";

  let jjStart: Date, jjEnde: Date, erstesJahr: boolean, jahrLabel: string;
  if (i.urlaubsjahr === "kalender") {
    jjStart = new Date(S.getFullYear(), 0, 1);
    jjEnde = new Date(S.getFullYear(), 11, 31);
    erstesJahr = E.getFullYear() === S.getFullYear();
    jahrLabel = `Kalenderjahr ${S.getFullYear()}`;
  } else {
    let n = S.getFullYear() - E.getFullYear();
    while (addY(E, n) > S) n--;
    jjStart = addY(E, n);
    jjEnde = new Date(addY(E, n + 1).getTime() - 86400000);
    erstesJahr = n === 0;
    jahrLabel = `${n + 1}. Arbeitsjahr`;
  }

  const von = E > jjStart ? E : jjStart;
  const bis = (i.mode === "austritt" || (i.urlaubsjahr === "arbeit" && erstesJahr)) ? S : jjEnde;
  const vollesJahr = von.getTime() === jjStart.getTime() && bis.getTime() === jjEnde.getTime();

  let anspruch: number, basis: string;
  if (i.mode === "eintritt" && i.urlaubsjahr === "arbeit" && erstesJahr && S >= addM(E, 6)) {
    anspruch = jahresStd; basis = "voller Jahresanspruch (ab dem 7. Monat, § 2 Abs 2 UrlG)";
  } else if (vollesJahr) {
    anspruch = jahresStd; basis = "voller Jahresanspruch";
  } else if (proMonat) {
    const m = Math.min(12, Math.max(0, monate(von, bis)));
    anspruch = jahresStd * m / 12; basis = `${m} von 12 Monaten (${fd(von)} – ${fd(bis)})`;
  } else {
    const genutzt = tage(von, bis) + 1, gesamt = tage(jjStart, jjEnde) + 1;
    anspruch = jahresStd * genutzt / gesamt; basis = `${genutzt} von ${gesamt} Tagen (${fd(von)} – ${fd(bis)})`;
  }

  const rest = anspruch + i.uebertrag - i.verbraucht;
  return {
    ok: true, ausmassPct: (wStd / VOLLZEIT) * 100, hProTag, jahresStd, jahresTage,
    jahrLabel, jjStart: fd(jjStart), jjEnde: fd(jjEnde), anspruchStd: anspruch, basis,
    uebertrag: i.uebertrag, verbraucht: i.verbraucht, restStd: rest, restTage: rest / hProTag, wochenstunden: wStd,
  };
}

export function fmtDe(n: number): string {
  try { return n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  catch { return n.toFixed(2).replace(".", ","); }
}
