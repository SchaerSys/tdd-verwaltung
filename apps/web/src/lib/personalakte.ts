/**
 * P2 · Personalakte – reine Logik ohne Datenbank.
 *
 * Grundlagen:
 *  - § 2 AVRAG: Dienstzettel unverzüglich nach Beginn des Arbeitsverhältnisses mit den
 *    Mindestinhalten (Name/Anschrift beider Seiten, Beginn, Ende bei Befristung,
 *    Kündigungsfrist, Dienstort, Einstufung, Verwendung, Entgelt, Urlaubsausmaß,
 *    Normalarbeitszeit, KV/Betriebsvereinbarung, Vorsorgekasse).
 *  - § 19 Abs 2 AngG: Probezeit höchstens ein Monat.
 *  - § 132 BAO / § 76 EStG: Lohnunterlagen sieben Jahre ab Ende des Kalenderjahres.
 *  - SV-Nummer: 10-stellig, Prüfziffer an 4. Stelle, Stellen 5–10 = Geburtsdatum TTMMJJ.
 */

export const BESCHAEFTIGUNG_LABEL: Record<string, string> = {
  VOLLZEIT: "Vollzeit", TEILZEIT: "Teilzeit", GERINGFUEGIG: "geringfügig", ZIVILDIENST: "Zivildienst", EHRENAMT: "ehrenamtlich",
};
export const DOK_ART_LABEL: Record<string, string> = {
  DIENSTZETTEL: "Dienstzettel", DIENSTVERTRAG: "Dienstvertrag", ZEUGNIS: "Zeugnis/Nachweis", AUSWEIS: "Ausweis/Meldezettel",
  FUEHRERSCHEIN: "Führerschein", UNTERWEISUNG: "Unterweisung (ASchG/Hygiene)", AERZTLICH: "ärztliche Bescheinigung", SONSTIG: "Sonstiges",
};
export const AUSTRITT_GRUND_LABEL: Record<string, string> = {
  KUENDIGUNG_AN: "Kündigung durch Arbeitnehmer:in", KUENDIGUNG_AG: "Kündigung durch Arbeitgeber", EINVERNEHMLICH: "einvernehmliche Auflösung",
  BEFRISTUNG: "Zeitablauf (Befristung)", PROBEZEIT: "Auflösung in der Probezeit", ENTLASSUNG: "Entlassung", AUSTRITT: "vorzeitiger Austritt",
  PENSION: "Pension", SONSTIG: "sonstig",
};

export interface AkteDaten {
  staffType: string;
  employmentStart: string | null;
  employmentEnd: string | null;
  beschaeftigung: string | null;
  taetigkeit: string | null;
  kvEinstufung: string | null;
  gehaltBrutto: string | number | null;
  probezeitBis: string | null;
  befristetBis: string | null;
  kuendigungsfrist: string | null;
  dienstzettelAm: string | null;
  geburtsdatum: string | null;
  svNummer: string | null;
  notfallName: string | null;
  weeklyHours: string | number | null;
  sollVerteilung: unknown;
  locationId: number | null;
  austrittGrund: string | null;
}

export interface AkteDokument { art: string; gueltigBis: string | null; bezeichnung: string }

export type HinweisStufe = "FEHLT" | "WARN" | "INFO";
export interface AkteHinweis { code: string; stufe: HinweisStufe; text: string }

const isoAdd = (iso: string, tage: number): string => {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + tage); return d.toISOString().slice(0, 10);
};

/** Ende der maximalen Probezeit (§ 19 Abs 2 AngG: ein Monat ab Beginn). */
export function probezeitMax(eintritt: string): string {
  const d = new Date(eintritt + "T00:00:00Z");
  const monat = d.getUTCMonth();
  d.setUTCMonth(monat + 1);
  // Monatsüberlauf (31.01. + 1 Monat) auf den Monatsletzten zurückziehen
  if (d.getUTCMonth() !== (monat + 1) % 12) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** Aufbewahrung bis: 7 Jahre ab Ende des Kalenderjahres des Austritts (§ 132 BAO). */
export function aufbewahrungBis(austritt: string): string {
  return `${Number(austritt.slice(0, 4)) + 7}-12-31`;
}

/** Österreichische SV-Nummer: 10 Ziffern, Prüfziffer (Gewichte 3 7 9 · 5 8 4 2 1 6) mod 11 an Stelle 4. */
export function svNummerGueltig(nr: string | null | undefined): boolean {
  const s = (nr ?? "").replace(/\s/g, "");
  if (!/^\d{10}$/.test(s)) return false;
  const z = s.split("").map(Number);
  const gew = [3, 7, 9, 0, 5, 8, 4, 2, 1, 6];
  const summe = z.reduce((acc, d, i) => acc + d * gew[i]!, 0);
  return summe % 11 === z[3];
}

/** Stellen 5–10 der SV-Nummer sollen dem Geburtsdatum (TTMMJJ) entsprechen – bei Nummernknappheit kann das abweichen. */
export function svGeburtsdatumPasst(nr: string, geburtsdatum: string): boolean {
  const s = nr.replace(/\s/g, "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(geburtsdatum) || s.length !== 10) return true;
  return s.slice(4) === geburtsdatum.slice(8, 10) + geburtsdatum.slice(5, 7) + geburtsdatum.slice(2, 4);
}

/** Ist eine Person Arbeitnehmer:in im Sinn des AVRAG (Angestellte, Fahrer:innen) – Zivis/Ehrenamt nicht. */
export function arbeitnehmer(p: Pick<AkteDaten, "staffType" | "beschaeftigung">): boolean {
  if (p.beschaeftigung === "ZIVILDIENST" || p.beschaeftigung === "EHRENAMT") return false;
  return p.staffType !== "ZIVILDIENER" && p.staffType !== "EHRENAMT";
}

/**
 * Vollständigkeits- und Fristenprüfung der Personalakte am Stichtag.
 * FEHLT = gesetzlich nötig und nicht vorhanden, WARN = Frist läuft / Widerspruch, INFO = empfohlen.
 */
export function aktePruefung(p: AkteDaten, dokumente: AkteDokument[], heute: string): AkteHinweis[] {
  const h: AkteHinweis[] = [];
  const an = arbeitnehmer(p);
  const ausgetreten = !!p.employmentEnd && p.employmentEnd < heute;

  if (!p.employmentStart) h.push({ code: "EINTRITT", stufe: "FEHLT", text: "Eintrittsdatum fehlt (Beginn des Arbeitsverhältnisses, § 2 Abs 2 Z 3 AVRAG)." });
  if (!p.beschaeftigung) h.push({ code: "BESCHAEFTIGUNG", stufe: an ? "FEHLT" : "INFO", text: "Beschäftigungsart (Vollzeit/Teilzeit/geringfügig …) fehlt." });

  if (an) {
    if (!p.taetigkeit) h.push({ code: "TAETIGKEIT", stufe: "FEHLT", text: "Vorgesehene Verwendung/Tätigkeit fehlt (§ 2 Abs 2 Z 8 AVRAG)." });
    if (!p.kvEinstufung) h.push({ code: "EINSTUFUNG", stufe: "FEHLT", text: "Einstufung fehlt – bei fehlendem Kollektivvertrag „kein KV“ eintragen (§ 2 Abs 2 Z 7 AVRAG)." });
    if (p.gehaltBrutto == null || Number(p.gehaltBrutto) <= 0) h.push({ code: "GEHALT", stufe: "FEHLT", text: "Grundgehalt brutto fehlt (§ 2 Abs 2 Z 9 AVRAG)." });
    if (!p.sollVerteilung && !(p.weeklyHours && Number(p.weeklyHours) > 0)) h.push({ code: "ARBEITSZEIT", stufe: "FEHLT", text: "Normalarbeitszeit fehlt – Wochenstunden oder Wochenverteilung eintragen (§ 2 Abs 2 Z 11 AVRAG)." });
    if (!p.locationId) h.push({ code: "DIENSTORT", stufe: "FEHLT", text: "Dienstort (Standort) fehlt (§ 2 Abs 2 Z 5 AVRAG)." });
    if (!p.kuendigungsfrist) h.push({ code: "KUENDIGUNG", stufe: "INFO", text: "Kündigungsfrist nicht vermerkt – ohne Vereinbarung gelten die Fristen des § 20 AngG." });
    if (!p.geburtsdatum) h.push({ code: "GEBURTSDATUM", stufe: "FEHLT", text: "Geburtsdatum fehlt (Anmeldung ÖGK)." });
    if (!p.svNummer) h.push({ code: "SV", stufe: "FEHLT", text: "SV-Nummer fehlt (Anmeldung ÖGK vor Arbeitsantritt)." });
    else if (!svNummerGueltig(p.svNummer)) h.push({ code: "SV_UNGUELTIG", stufe: "WARN", text: "SV-Nummer hat keine gültige Prüfziffer." });
    else if (p.geburtsdatum && !svGeburtsdatumPasst(p.svNummer, p.geburtsdatum)) h.push({ code: "SV_DATUM", stufe: "INFO", text: "Datumsteil der SV-Nummer weicht vom Geburtsdatum ab – bitte prüfen." });

    if (p.employmentStart && p.employmentStart <= heute && !p.dienstzettelAm && !ausgetreten)
      h.push({ code: "DIENSTZETTEL", stufe: "FEHLT", text: "Dienstzettel noch nicht ausgehändigt – unverzüglich nach Beginn (§ 2 Abs 1 AVRAG)." });
    if (!dokumente.some((d) => d.art === "DIENSTZETTEL" || d.art === "DIENSTVERTRAG") && !ausgetreten)
      h.push({ code: "DOK_DIENSTZETTEL", stufe: "INFO", text: "Unterschriebener Dienstzettel/Dienstvertrag nicht als Dokument abgelegt." });

    if (p.employmentStart && p.probezeitBis && p.probezeitBis > probezeitMax(p.employmentStart))
      h.push({ code: "PROBEZEIT_LANG", stufe: "WARN", text: `Probezeit länger als ein Monat – zulässig nur bis ${probezeitMax(p.employmentStart)} (§ 19 Abs 2 AngG).` });
    if (p.probezeitBis && p.probezeitBis >= heute && p.probezeitBis <= isoAdd(heute, 14))
      h.push({ code: "PROBEZEIT_ENDE", stufe: "WARN", text: `Probezeit endet am ${p.probezeitBis} – danach nur mehr mit Kündigungsfrist lösbar.` });
    if (p.befristetBis && p.befristetBis >= heute && p.befristetBis <= isoAdd(heute, 60))
      h.push({ code: "BEFRISTUNG_ENDE", stufe: "WARN", text: `Befristung endet am ${p.befristetBis} – Verlängerung oder Austritt vorbereiten (Kettenbefristung vermeiden).` });
  }

  if (p.employmentEnd && !p.austrittGrund) h.push({ code: "AUSTRITT_GRUND", stufe: "INFO", text: "Austritt eingetragen, Beendigungsart fehlt (Abmeldung ÖGK, Arbeitsbescheinigung)." });
  if (!p.notfallName) h.push({ code: "NOTFALL", stufe: "INFO", text: "Kein Notfallkontakt hinterlegt." });

  for (const d of dokumente) {
    if (!d.gueltigBis) continue;
    if (d.gueltigBis < heute) h.push({ code: "DOK_ABGELAUFEN", stufe: "WARN", text: `${DOK_ART_LABEL[d.art] ?? d.art} „${d.bezeichnung}“ ist seit ${d.gueltigBis} abgelaufen.` });
    else if (d.gueltigBis <= isoAdd(heute, 60)) h.push({ code: "DOK_LAEUFT_AB", stufe: "INFO", text: `${DOK_ART_LABEL[d.art] ?? d.art} „${d.bezeichnung}“ läuft am ${d.gueltigBis} ab.` });
  }
  return h;
}
