/**
 * A4 Touren: reine Planungslogik (Wochentag, Konfliktpruefung), ohne Datenbank –
 * damit die Regeln testbar sind und die Disposition sie live anzeigen kann.
 */
export const WOCHENTAGE = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
export const WOCHENTAGE_KURZ = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

/** ISO-Wochentag 1=Mo … 7=So eines ISO-Datums (kalendarisch, zeitzonenfrei). */
export function wochentag(datum: string): number {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j!, m! - 1, t)).getUTCDay(); // 0=So
  return d === 0 ? 7 : d;
}

export function datumPlus(datum: string, tage: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Date(Date.UTC(j!, m! - 1, t! + tage)).toISOString().slice(0, 10);
}

export function heuteIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" }); // YYYY-MM-DD
}

export interface PlanTour {
  id: string; datum: string; name: string; fahrerId: string | null; fahrzeugId: number | null; status: string;
  kuehlbedarf: boolean; // mindestens ein Abholstopp mit Kuehlware
}
export interface PlanFahrer { id: string; name: string; kannFahren: boolean; isActive: boolean; fahrerTage: number[] }
export interface PlanFahrzeug { id: number; kennzeichen: string; kuehlung: boolean; isActive: boolean; ausserBetriebVon: string | null; ausserBetriebBis: string | null; pickerlBis: string | null }
export interface PlanAbwesenheit { staffId: string; art: string; von: string; bis: string }

export interface Konflikt { code: string; schwere: "FEHLER" | "WARNUNG"; text: string }

const ART_LABEL: Record<string, string> = { URLAUB: "im Urlaub", KRANK: "krank gemeldet", SONSTIG: "abwesend" };

/**
 * Konflikte einer Tour an ihrem Tag. FEHLER = so kann sie nicht fahren,
 * WARNUNG = geht, aber jemand sollte hinschauen.
 */
export function konflikte(
  tour: PlanTour, tourenAmTag: PlanTour[], fahrer: PlanFahrer[], fahrzeuge: PlanFahrzeug[], abwesenheiten: PlanAbwesenheit[],
): Konflikt[] {
  const k: Konflikt[] = [];
  if (tour.status === "AUSGEFALLEN") return k;
  const tag = wochentag(tour.datum);
  const andere = tourenAmTag.filter((t) => t.id !== tour.id && t.datum === tour.datum && t.status !== "AUSGEFALLEN");

  if (!tour.fahrerId) k.push({ code: "FAHRER_FEHLT", schwere: "WARNUNG", text: "Kein Fahrer eingeteilt (die Tour geht ans Tablet des Fahrzeugs, der Name fehlt nur auf dem Laufzettel)." });
  else {
    const f = fahrer.find((x) => x.id === tour.fahrerId);
    if (!f) k.push({ code: "FAHRER_UNBEKANNT", schwere: "FEHLER", text: "Fahrer nicht im Personal-Verzeichnis." });
    else {
      if (!f.isActive) k.push({ code: "FAHRER_INAKTIV", schwere: "FEHLER", text: `${f.name} ist nicht mehr aktiv.` });
      if (!f.kannFahren) k.push({ code: "FAHRER_KEIN_FAHRER", schwere: "WARNUNG", text: `${f.name} ist nicht als Fahrer:in geführt.` });
      if (f.fahrerTage.length > 0 && !f.fahrerTage.includes(tag)) k.push({ code: "FAHRER_TAG", schwere: "WARNUNG", text: `${f.name} fährt normalerweise nicht am ${WOCHENTAGE[tag]}.` });
      const ab = abwesenheiten.find((a) => a.staffId === f.id && a.von <= tour.datum && a.bis >= tour.datum);
      if (ab) k.push({ code: "FAHRER_ABWESEND", schwere: "FEHLER", text: `${f.name} ist ${ART_LABEL[ab.art] ?? "abwesend"} (${ab.von} bis ${ab.bis}).` });
      const doppelt = andere.find((t) => t.fahrerId === f.id);
      if (doppelt) k.push({ code: "FAHRER_DOPPELT", schwere: "WARNUNG", text: `${f.name} ist an diesem Tag auch für „${doppelt.name}“ eingeteilt.` });
    }
  }

  if (!tour.fahrzeugId) k.push({ code: "FAHRZEUG_FEHLT", schwere: "FEHLER", text: "Kein Fahrzeug zugewiesen." });
  else {
    const v = fahrzeuge.find((x) => x.id === tour.fahrzeugId);
    if (!v) k.push({ code: "FAHRZEUG_UNBEKANNT", schwere: "FEHLER", text: "Fahrzeug nicht in der Liste." });
    else {
      if (!v.isActive) k.push({ code: "FAHRZEUG_INAKTIV", schwere: "FEHLER", text: `${v.kennzeichen} ist stillgelegt.` });
      if (v.ausserBetriebVon && v.ausserBetriebVon <= tour.datum && (!v.ausserBetriebBis || v.ausserBetriebBis >= tour.datum))
        k.push({ code: "FAHRZEUG_AUSSER_BETRIEB", schwere: "FEHLER", text: `${v.kennzeichen} ist außer Betrieb (Werkstatt${v.ausserBetriebBis ? ` bis ${v.ausserBetriebBis}` : ""}).` });
      if (v.pickerlBis && v.pickerlBis < tour.datum) k.push({ code: "PICKERL_ABGELAUFEN", schwere: "WARNUNG", text: `${v.kennzeichen}: §57a-Begutachtung abgelaufen (${v.pickerlBis}).` });
      if (tour.kuehlbedarf && !v.kuehlung) k.push({ code: "KUEHLUNG_FEHLT", schwere: "FEHLER", text: `Kühlware auf der Tour, aber ${v.kennzeichen} hat keine Kühlung.` });
      const doppelt = andere.find((t) => t.fahrzeugId === v.id);
      if (doppelt) k.push({ code: "FAHRZEUG_DOPPELT", schwere: "WARNUNG", text: `${v.kennzeichen} ist an diesem Tag auch für „${doppelt.name}“ eingeplant.` });
    }
  }
  return k;
}

/** Zusammenfassung fuer die Tagesansicht. */
export function ampel(k: Konflikt[]): "good" | "warn" | "bad" {
  if (k.some((x) => x.schwere === "FEHLER")) return "bad";
  if (k.length) return "warn";
  return "good";
}

/** Zeit "07:30:00" -> "07:30". */
export function zeitKurz(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}
