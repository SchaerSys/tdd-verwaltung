/**
 * P5 · Dienstplan – reine Logik ohne Datenbank.
 *
 * Ein Dienst ist eine geplante Anwesenheit (Tag, von/bis, Pause, Standort, Tätigkeit).
 * Die Prüfung schaut auf die Grenzen des AZG (Tages-/Wochenhöchstarbeitszeit, Ruhezeit
 * 11 h, Ruhepause ab 6 h), genehmigte Abwesenheiten, Feiertage/betriebsfreie Tage,
 * Überschneidungen und – als Information – den Abstand zum Wochensoll der Verteilung.
 */
import { wochentagIso } from "./abwesenheit";

export const TAETIGKEIT_LABEL: Record<string, string> = {
  AUSGABE: "Ausgabe", FAHRDIENST: "Fahrdienst", LAGER: "Lager", BUERO: "Büro", SONSTIG: "Sonstiges",
};
export const TAETIGKEIT_KURZ: Record<string, string> = { AUSGABE: "A", FAHRDIENST: "F", LAGER: "L", BUERO: "B", SONSTIG: "S" };

export interface Dienst {
  id: string; datum: string; staffId: string; locationId: number | null;
  von: string; bis: string; pauseMin: number; taetigkeit: string; notiz?: string | null;
}
export interface StandardDienst { von: string; bis: string; pause?: number; location?: number | null; taetigkeit?: string }
export type DienstStandard = Record<string, StandardDienst>; // Schluessel ISO-Wochentag "1".."7"

export interface PlanRegeln { maxTagMin: number; maxWocheMin: number; pauseAbMin: number; pauseMin: number; ruhezeitMin: number }
export const PLAN_REGELN_STANDARD: PlanRegeln = { maxTagMin: 600, maxWocheMin: 3000, pauseAbMin: 360, pauseMin: 30, ruhezeitMin: 660 };

export type PlanHinweis = { datum: string; staffId: string | null; code: string; schwere: "FEHLER" | "WARNUNG" | "INFO"; text: string };

/** Montag der Woche, in der `datum` liegt. */
export function wochenStart(datum: string): string {
  const d = new Date(datum + "T00:00:00Z");
  const t = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (t - 1));
  return d.toISOString().slice(0, 10);
}
export function plusTage(datum: string, n: number): string {
  const d = new Date(datum + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function wochenTage(start: string): string[] { return [0, 1, 2, 3, 4, 5, 6].map((i) => plusTage(start, i)); }

export const zeitMin = (hhmm: string): number => { const [h, m] = hhmm.slice(0, 5).split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
export const minZeit = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Netto-Arbeitsminuten eines Dienstes. */
export function dienstMinuten(d: Pick<Dienst, "von" | "bis" | "pauseMin">): number {
  return Math.max(0, zeitMin(d.bis) - zeitMin(d.von) - d.pauseMin);
}

/** Gesetzliche Mindestpause: ab 6 h Arbeitszeit 30 min (§ 11 AZG). */
export function pflichtPause(bruttoMin: number, regeln: PlanRegeln = PLAN_REGELN_STANDARD): number {
  return bruttoMin > regeln.pauseAbMin ? regeln.pauseMin : 0;
}

/**
 * Standard-Dienst aus der Wochenverteilung ableiten: Beginn um `beginn`, Dauer = Soll + Pflichtpause.
 * Nur Tage mit Soll > 0.
 */
export function standardAusVerteilung(soll: Record<number, number>, beginn = "08:00", regeln: PlanRegeln = PLAN_REGELN_STANDARD): DienstStandard {
  const out: DienstStandard = {};
  for (let t = 1; t <= 7; t++) {
    const s = soll[t] ?? 0;
    if (s <= 0) continue;
    const pause = pflichtPause(s, regeln); // Soll ist Nettozeit: ueber 6 h braucht es die Pause zusaetzlich
    out[String(t)] = { von: beginn, bis: minZeit(zeitMin(beginn) + s + pause), pause };
  }
  return out;
}

/** Standard-Dienste einer Person für eine Woche als (noch nicht gespeicherte) Dienste. */
export function wocheAusStandard(staffId: string, standard: DienstStandard | null, wocheStartIso: string): Omit<Dienst, "id">[] {
  if (!standard) return [];
  return wochenTage(wocheStartIso).flatMap((datum) => {
    const s = standard[String(wochentagIso(datum))];
    if (!s || !s.von || !s.bis || zeitMin(s.bis) <= zeitMin(s.von)) return [];
    return [{ datum, staffId, locationId: s.location ?? null, von: s.von, bis: s.bis, pauseMin: s.pause ?? 0, taetigkeit: s.taetigkeit ?? "AUSGABE" }];
  });
}

export interface PlanAbwesenheit { staffId: string; von: string; bis: string; art: string; status: string }
export interface PlanPerson { id: string; soll: Record<number, number>; name: string }

/**
 * Prüfung einer Woche. `dienste` sollen die Woche plus den Sonntag davor enthalten (Ruhezeit
 * zum Vortag). Feiertage: Datum -> Name (inkl. betriebsfreie Tage).
 */
export function planPruefung(p: {
  wocheStart: string; dienste: Dienst[]; personen: PlanPerson[]; abwesenheiten: PlanAbwesenheit[];
  feiertage: Map<string, string>; regeln?: PlanRegeln;
}): PlanHinweis[] {
  const R = p.regeln ?? PLAN_REGELN_STANDARD;
  const tage = wochenTage(p.wocheStart);
  const ende = tage[6]!;
  const h: PlanHinweis[] = [];
  const name = (id: string) => p.personen.find((x) => x.id === id)?.name ?? "?";

  for (const person of p.personen) {
    const meine = p.dienste.filter((d) => d.staffId === person.id).sort((a, b) => (a.datum + a.von).localeCompare(b.datum + b.von));
    const inWoche = meine.filter((d) => d.datum >= p.wocheStart && d.datum <= ende);
    let wocheMin = 0;

    for (const datum of tage) {
      const amTag = inWoche.filter((d) => d.datum === datum);
      if (amTag.length === 0) continue;
      const netto = amTag.reduce((a, d) => a + dienstMinuten(d), 0);
      const brutto = amTag.reduce((a, d) => a + (zeitMin(d.bis) - zeitMin(d.von)), 0);
      const pause = amTag.reduce((a, d) => a + d.pauseMin, 0);
      wocheMin += netto;

      if (netto > R.maxTagMin) h.push({ datum, staffId: person.id, code: "TAG_MAX", schwere: "FEHLER", text: `${name(person.id)}: ${Math.round(netto / 6) / 10} h am Tag – über ${R.maxTagMin / 60} h (§ 9 AZG).` });
      if (brutto > R.pauseAbMin && pause < R.pauseMin) h.push({ datum, staffId: person.id, code: "PAUSE", schwere: "WARNUNG", text: `${name(person.id)}: über ${R.pauseAbMin / 60} h ohne ${R.pauseMin} min Pause (§ 11 AZG).` });

      // Überschneidung mehrerer Dienste am Tag
      for (let i = 1; i < amTag.length; i++) {
        if (zeitMin(amTag[i]!.von) < zeitMin(amTag[i - 1]!.bis)) h.push({ datum, staffId: person.id, code: "UEBERLAPPUNG", schwere: "FEHLER", text: `${name(person.id)}: zwei Dienste überschneiden sich (${amTag[i - 1]!.von.slice(0, 5)}–${amTag[i - 1]!.bis.slice(0, 5)} und ${amTag[i]!.von.slice(0, 5)}–${amTag[i]!.bis.slice(0, 5)}).` });
      }

      // Genehmigte Abwesenheit
      const abw = p.abwesenheiten.find((a) => a.staffId === person.id && a.status === "GENEHMIGT" && a.von <= datum && a.bis >= datum);
      if (abw) h.push({ datum, staffId: person.id, code: "ABWESEND", schwere: "FEHLER", text: `${name(person.id)} ist ${abw.art === "KRANK" ? "krank" : abw.art === "URLAUB" ? "im Urlaub" : "abwesend"} – Dienst trotzdem geplant.` });
      const offen = p.abwesenheiten.find((a) => a.staffId === person.id && a.status === "BEANTRAGT" && a.von <= datum && a.bis >= datum);
      if (offen && !abw) h.push({ datum, staffId: person.id, code: "ANTRAG_OFFEN", schwere: "WARNUNG", text: `${name(person.id)}: offener Antrag (${offen.art.toLowerCase()}) für diesen Tag.` });

      const feier = p.feiertage.get(datum);
      if (feier) h.push({ datum, staffId: person.id, code: "FEIERTAG", schwere: "WARNUNG", text: `${name(person.id)}: Dienst am ${feier} (Feiertagsarbeit nur mit Ausnahme, § 7 ARG).` });
      else if (wochentagIso(datum) === 7) h.push({ datum, staffId: person.id, code: "SONNTAG", schwere: "WARNUNG", text: `${name(person.id)}: Sonntagsdienst (§ 3 ARG).` });

      // Ruhezeit 11 h zum vorherigen Dienst (auch Sonntag der Vorwoche)
      const vortag = plusTage(datum, -1);
      const gestern = meine.filter((d) => d.datum === vortag).sort((a, b) => b.bis.localeCompare(a.bis))[0];
      const erster = amTag[0]!;
      if (gestern) {
        const ruhe = 24 * 60 - zeitMin(gestern.bis) + zeitMin(erster.von);
        if (ruhe < R.ruhezeitMin) h.push({ datum, staffId: person.id, code: "RUHEZEIT", schwere: "FEHLER", text: `${name(person.id)}: nur ${Math.round(ruhe / 6) / 10} h Ruhezeit seit ${gestern.bis.slice(0, 5)} am Vortag (11 h, § 12 AZG).` });
      }
    }

    if (wocheMin > R.maxWocheMin) h.push({ datum: p.wocheStart, staffId: person.id, code: "WOCHE_MAX", schwere: "FEHLER", text: `${name(person.id)}: ${Math.round(wocheMin / 6) / 10} h in der Woche – über ${R.maxWocheMin / 60} h (§ 9 AZG).` });

    // Abstand zum Wochensoll (ohne Tage mit genehmigter Abwesenheit/Feiertag)
    const sollWoche = tage.reduce((a, datum) => {
      const frei = p.feiertage.has(datum) || p.abwesenheiten.some((x) => x.staffId === person.id && x.status === "GENEHMIGT" && x.von <= datum && x.bis >= datum);
      return a + (frei ? 0 : (person.soll[wochentagIso(datum)] ?? 0));
    }, 0);
    if (sollWoche > 0 && inWoche.length === 0) h.push({ datum: p.wocheStart, staffId: person.id, code: "KEIN_DIENST", schwere: "INFO", text: `${name(person.id)}: kein Dienst geplant (Soll ${Math.round(sollWoche / 6) / 10} h).` });
    else if (sollWoche > 0 && Math.abs(wocheMin - sollWoche) >= 60) h.push({ datum: p.wocheStart, staffId: person.id, code: "SOLL_ABWEICHUNG", schwere: "INFO", text: `${name(person.id)}: geplant ${Math.round(wocheMin / 6) / 10} h, Soll ${Math.round(sollWoche / 6) / 10} h.` });
  }
  return h;
}

export interface OeffnungsSlot { from: string; to: string }
/**
 * Besetzung der Ausgabestellen: jedes Öffnungsfenster braucht mindestens einen Dienst „Ausgabe“,
 * der es komplett abdeckt (mehrere Dienste dürfen sich das Fenster teilen).
 */
export function besetzungPruefung(p: {
  wocheStart: string; dienste: Dienst[];
  standorte: { id: number; name: string; oeffnung: Partial<Record<number, OeffnungsSlot[]>> }[];
  feiertage: Map<string, string>;
}): PlanHinweis[] {
  const h: PlanHinweis[] = [];
  for (const datum of wochenTage(p.wocheStart)) {
    if (p.feiertage.has(datum)) continue;
    const wt = wochentagIso(datum);
    for (const s of p.standorte) {
      for (const slot of s.oeffnung[wt] ?? []) {
        const von = zeitMin(slot.from), bis = zeitMin(slot.to);
        const da = p.dienste.filter((d) => d.datum === datum && d.locationId === s.id && d.taetigkeit === "AUSGABE")
          .map((d) => [zeitMin(d.von), zeitMin(d.bis)] as const).sort((a, b) => a[0] - b[0]);
        // Lückensuche über das Fenster
        let cursor = von; let luecke: number | null = null;
        for (const [a, b] of da) { if (a > cursor) { luecke = cursor; break; } cursor = Math.max(cursor, b); if (cursor >= bis) break; }
        if (luecke === null && cursor < bis) luecke = cursor;
        if (luecke !== null) h.push({ datum, staffId: null, code: "UNBESETZT", schwere: da.length ? "WARNUNG" : "FEHLER", text: `${s.name}: ${slot.from}–${slot.to} ${da.length ? `ab ${minZeit(luecke)} nicht besetzt` : "niemand eingeteilt"}.` });
      }
    }
  }
  return h;
}

/** Wochensumme je Person in Minuten. */
export function wochenSummen(dienste: Dienst[], wocheStartIso: string): Map<string, number> {
  const ende = plusTage(wocheStartIso, 6);
  const m = new Map<string, number>();
  for (const d of dienste) {
    if (d.datum < wocheStartIso || d.datum > ende) continue;
    m.set(d.staffId, (m.get(d.staffId) ?? 0) + dienstMinuten(d));
  }
  return m;
}
