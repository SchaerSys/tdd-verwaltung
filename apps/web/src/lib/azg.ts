/**
 * Arbeitszeit nach AZG/ARG – reine Auswertung eines Monats je Person.
 *  - Soll je Tag aus der fixen Wochenverteilung (Teilzeit: § 19c AZG), sonst Wochenstunden ÷ 5.
 *  - Feiertage (Feiertagsruhegesetz) und bezahlte Abwesenheiten (Urlaub, Krankenstand …)
 *    werden als Gutschrift in Hoehe des Tagessolls gefuehrt.
 *  - Pruefungen: Tageshoechstarbeitszeit, Wochenhoechstarbeitszeit, Ruhepause, Ruhezeit,
 *    Wochenendruhe, vergessenes Ausstempeln.
 *  - Mehrarbeit (Teilzeit, § 19d) und Ueberstunden (ueber Normalarbeitszeit) je Woche.
 * Alle Grenzen kommen aus `ZeitRegeln` (Verein/KV-abhaengig, im Admin einstellbar).
 */
import { dayTotals, viennaParts, type Ev } from "./zeit";

export interface ZeitRegeln {
  maxTagMin: number;          // 600 (10 h, § 9 AZG)
  maxWocheMin: number;        // 3000 (50 h)
  pauseAbMin: number;         // 360 (ab 6 h, § 11)
  pauseMin: number;           // 30
  ruhezeitMin: number;        // 660 (11 h, § 12)
  normalarbeitszeitWocheMin: number; // 2400 (40 h)
  mehrarbeitZuschlag: number; // 25 %
  ueberstundenZuschlag: number; // 50 %
  /** ZDG: Zivildienst – keine Mehrarbeit/Ueberstunden (nur Zeitausgleich), Paragraphen des ZDG, Sonntag nur bei Erlaubnis. */
  gesetz?: "AZG" | "ZDG";
  sonntagErlaubt?: boolean;
}
export const REGELN_STANDARD: ZeitRegeln = { maxTagMin: 600, maxWocheMin: 3000, pauseAbMin: 360, pauseMin: 30, ruhezeitMin: 660, normalarbeitszeitWocheMin: 2400, mehrarbeitZuschlag: 25, ueberstundenZuschlag: 50 };

/** Sollminuten je ISO-Wochentag 1..7 (Verteilung); leer = aus Wochenstunden Mo–Fr. */
export type Verteilung = Partial<Record<"1" | "2" | "3" | "4" | "5" | "6" | "7", number>>;

export function sollJeWochentag(verteilung: Verteilung | null | undefined, wochenstunden: number | null): Record<number, number> {
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  const hatVerteilung = verteilung && Object.values(verteilung).some((v) => (v ?? 0) > 0);
  if (hatVerteilung) {
    for (let t = 1; t <= 7; t++) out[t] = Math.max(0, Math.round(Number(verteilung[String(t) as keyof Verteilung] ?? 0)));
  } else if (wochenstunden) {
    for (let t = 1; t <= 5; t++) out[t] = Math.round((wochenstunden / 5) * 60);
  }
  return out;
}

export interface Abwesenheit { art: string; von: string; bis: string } // ISO-Daten, inklusiv
export type Warnung = { datum: string; code: string; schwere: "FEHLER" | "WARNUNG"; text: string };

export interface TagAuswertung {
  datum: string; wochentag: number; sollMin: number; istMin: number; breakMin: number; gutschriftMin: number; gutschriftGrund: string | null;
  kommen: string | null; gehen: string | null; offen: boolean; warnungen: Warnung[];
}
export interface WocheAuswertung { kw: string; istMin: number; vertragMin: number; mehrarbeitMin: number; ueberstundenMin: number }
export interface MonatAuswertung {
  jahr: number; monat: number; tage: TagAuswertung[]; wochen: WocheAuswertung[];
  istMin: number; sollMin: number; gutschriftMin: number; saldoMin: number; mehrarbeitMin: number; ueberstundenMin: number;
  warnungen: Warnung[]; feiertage: number; abwesenheitstage: number;
}

const ART_LABEL: Record<string, string> = { URLAUB: "Urlaub", KRANK: "Krankenstand", SONSTIG: "Abwesenheit", ZEITAUSGLEICH: "Zeitausgleich", PFLEGE: "Pflegefreistellung", SONDERURLAUB: "Sonderurlaub", UNBEZAHLT: "unbezahlt" };

function isoWoche(datum: string): string {
  const d = new Date(datum + "T00:00:00Z");
  const tag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tag);
  const jahrStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil(((d.getTime() - jahrStart.getTime()) / 864e5 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(kw).padStart(2, "0")}`;
}

export function monatAuswertung(p: {
  events: Ev[]; verteilung: Verteilung | null; wochenstunden: number | null; jahr: number; monat: number;
  feiertage: Map<string, string>; betriebsfrei?: Map<string, string>; abwesenheiten: Abwesenheit[]; regeln?: ZeitRegeln; now?: Date;
}): MonatAuswertung {
  const R = p.regeln ?? REGELN_STANDARD;
  const zdg = R.gesetz === "ZDG";
  const par = (azg: string, zdgPar: string) => (zdg ? zdgPar : azg);
  const now = p.now ?? new Date();
  const soll = sollJeWochentag(p.verteilung, p.wochenstunden);
  const tageImMonat = new Date(Date.UTC(p.jahr, p.monat, 0)).getUTCDate();
  const heute = viennaParts(now).datum;

  const jeTag = new Map<string, Ev[]>();
  for (const e of p.events) {
    const { datum } = viennaParts(new Date(e.at));
    if (!jeTag.has(datum)) jeTag.set(datum, []);
    jeTag.get(datum)!.push(e);
  }
  const abwesend = (datum: string) => p.abwesenheiten.find((a) => a.von <= datum && a.bis >= datum);

  const tage: TagAuswertung[] = [];
  const warnungen: Warnung[] = [];
  let istMin = 0, sollMin = 0, gutschriftMin = 0, feiertagN = 0, abwesenheitN = 0;
  let letztesEnde: Date | null = null;

  for (let t = 1; t <= tageImMonat; t++) {
    const datum = `${p.jahr}-${String(p.monat).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
    const js = new Date(Date.UTC(p.jahr, p.monat - 1, t)).getUTCDay();
    const wochentag = js === 0 ? 7 : js;
    const evs = (jeTag.get(datum) ?? []).slice().sort((a, b) => +new Date(a.at) - +new Date(b.at));
    const bezug = datum === heute ? now : new Date(evs.length ? evs[evs.length - 1]!.at : now);
    const tot = dayTotals(evs, bezug);
    const ins = evs.filter((e) => e.kind === "IN");
    const outs = evs.filter((e) => e.kind === "OUT");
    const faellig = datum <= heute;
    const planSoll = soll[wochentag] ?? 0;
    const feiertag = p.feiertage.get(datum) ?? null;
    const frei = p.betriebsfrei?.get(datum) ?? null;
    const ab = abwesend(datum);
    const tw: Warnung[] = [];

    // Soll gilt nur bis heute; Feiertag/Betriebsfrei/Abwesenheit auf einem Solltag = Gutschrift.
    let sollTag = faellig ? planSoll : 0;
    let gutschrift = 0; let grund: string | null = null;
    if (faellig && planSoll > 0) {
      if (feiertag) { gutschrift = planSoll; grund = feiertag; feiertagN++; }
      else if (frei) { gutschrift = planSoll; grund = frei; }
      else if (ab && ab.art !== "UNBEZAHLT") { gutschrift = planSoll; grund = ART_LABEL[ab.art] ?? ab.art; abwesenheitN++; }
      else if (ab) { grund = ART_LABEL[ab.art] ?? ab.art; abwesenheitN++; }
    }
    if (!faellig) sollTag = 0;

    // Pruefungen nur an Tagen mit Buchungen
    if (evs.length) {
      if (tot.workedMin > 12 * 60) tw.push({ datum, code: "TAG_12H", schwere: "FEHLER", text: `${fmt(tot.workedMin)} ${zdg ? "Dienstzeit" : "Arbeitszeit"} – über 12 h ist auch mit Ausnahme unzulässig (${par("§ 9 AZG", "§ 23 ZDG")}).` });
      else if (tot.workedMin > R.maxTagMin) tw.push({ datum, code: "TAG_MAX", schwere: zdg ? "FEHLER" : "WARNUNG", text: `${fmt(tot.workedMin)} ${zdg ? "Dienstzeit" : "Arbeitszeit"} – über ${fmt(R.maxTagMin)} ${zdg ? "Tageshöchstdienstzeit laut ZISA" : "Tageshöchstarbeitszeit"} (${par("§ 9 AZG", "§ 23 ZDG")}).` });
      if (tot.workedMin > R.pauseAbMin && tot.breakMin < R.pauseMin) tw.push({ datum, code: "PAUSE", schwere: "WARNUNG", text: `Keine Ruhepause von ${R.pauseMin} min bei mehr als ${fmt(R.pauseAbMin)} (${par("§ 11 AZG", "§ 23 ZDG")}).` });
      if (tot.open && datum !== heute) tw.push({ datum, code: "OFFEN", schwere: "WARNUNG", text: "Ausstempeln vergessen – Tag im Ist mit 0 gerechnet, bitte korrigieren." });
      if (feiertag && tot.workedMin > 0) tw.push({ datum, code: "FEIERTAG", schwere: zdg && !R.sonntagErlaubt ? "FEHLER" : "WARNUNG", text: zdg ? `Dienst am Feiertag (${feiertag}) – nur wenn die Einrichtung es erfordert, Ersatzruhe gewähren (§ 23 ZDG).` : `Arbeit am Feiertag (${feiertag}) – Feiertagsruhe/Feiertagsarbeitsentgelt beachten (ARG).` });
      if (wochentag === 7 && tot.workedMin > 0) tw.push({ datum, code: "SONNTAG", schwere: zdg && !R.sonntagErlaubt ? "FEHLER" : "WARNUNG", text: zdg ? (R.sonntagErlaubt ? "Sonntagsdienst – Ersatzruhe in der Folgewoche (§ 23 ZDG)." : "Sonntagsdienst ist für diese Einrichtung nicht vorgesehen (Regeln Zivildienst)." ) : "Arbeit am Sonntag – Wochenendruhe 36 h prüfen (§ 3 ARG)." });
      if (ins[0] && letztesEnde) {
        const ruhe = (new Date(ins[0].at).getTime() - letztesEnde.getTime()) / 60000;
        if (ruhe < R.ruhezeitMin) tw.push({ datum, code: "RUHEZEIT", schwere: "WARNUNG", text: `Nur ${fmt(Math.max(0, Math.round(ruhe)))} Ruhezeit seit dem Vortag – mindestens ${fmt(R.ruhezeitMin)} (${par("§ 12 AZG", "§ 23 ZDG")}).` });
      }
      if (outs.length && !tot.open) letztesEnde = new Date(outs[outs.length - 1]!.at);
      else if (tot.open) letztesEnde = null;
    }
    if (ab && tot.workedMin > 0) tw.push({ datum, code: "ABWESEND_GEARBEITET", schwere: "WARNUNG", text: `Buchungen trotz ${ART_LABEL[ab.art] ?? "Abwesenheit"} – eines von beiden stimmt nicht.` });

    istMin += tot.workedMin; sollMin += sollTag; gutschriftMin += gutschrift;
    warnungen.push(...tw);
    tage.push({
      datum, wochentag, sollMin: sollTag, istMin: tot.workedMin, breakMin: tot.breakMin, gutschriftMin: gutschrift, gutschriftGrund: grund,
      kommen: ins[0] ? viennaParts(new Date(ins[0].at)).zeit : null,
      gehen: outs.length ? viennaParts(new Date(outs[outs.length - 1]!.at)).zeit : null,
      offen: tot.open && datum !== heute, warnungen: tw,
    });
  }

  // Wochen: Hoechstarbeitszeit, Mehrarbeit (Teilzeit) und Ueberstunden
  const vertragWoche = Object.values(soll).reduce((s, v) => s + v, 0);
  const jeWoche = new Map<string, number>();
  for (const t of tage) jeWoche.set(isoWoche(t.datum), (jeWoche.get(isoWoche(t.datum)) ?? 0) + t.istMin);
  const wochen: WocheAuswertung[] = [];
  let mehrarbeitMin = 0, ueberstundenMin = 0;
  for (const [kw, ist] of jeWoche) {
    const nz = R.normalarbeitszeitWocheMin;
    // Zivildienst: kein Mehrarbeits-/Ueberstundenbegriff – Mehrdienst geht 1:1 als Saldo ins Zeitkonto
    const mehr = zdg ? 0 : vertragWoche < nz ? Math.max(0, Math.min(ist, nz) - vertragWoche) : 0;
    const ueber = zdg ? 0 : Math.max(0, ist - Math.max(nz, vertragWoche));
    mehrarbeitMin += mehr; ueberstundenMin += ueber;
    wochen.push({ kw, istMin: ist, vertragMin: vertragWoche, mehrarbeitMin: mehr, ueberstundenMin: ueber });
    if (ist > R.maxWocheMin) {
      const erster = tage.find((t) => isoWoche(t.datum) === kw)!;
      warnungen.push({ datum: erster.datum, code: "WOCHE_MAX", schwere: zdg ? "FEHLER" : "WARNUNG", text: `${fmt(ist)} in Woche ${kw} – über ${fmt(R.maxWocheMin)} ${zdg ? "Wochenhöchstdienstzeit laut ZISA" : "Wochenhöchstarbeitszeit"} (${par("§ 9 AZG", "§ 23 ZDG")}; Teilwochen am Monatsrand unvollständig).` });
    }
  }

  return { jahr: p.jahr, monat: p.monat, tage, wochen, istMin, sollMin, gutschriftMin, saldoMin: istMin + gutschriftMin - sollMin, mehrarbeitMin, ueberstundenMin, warnungen, feiertage: feiertagN, abwesenheitstage: abwesenheitN };
}

function fmt(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} h`;
}
