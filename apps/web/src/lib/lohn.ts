/**
 * P6 · Lohnexport – reine Logik ohne Datenbank.
 * Monatszeile je Arbeitnehmer:in für die externe Lohnverrechnung: Zeiten aus der
 * AZG-Monatsauswertung (bzw. dem festen Monatsabschluss), Abwesenheitstage je Art im Monat.
 * Kein Gehalt im Export – das hat die Lohnverrechnung selbst; SV-Nummer nur als Schlüssel.
 */
import { urlaubstage } from "./abwesenheit";
import type { MonatAuswertung } from "./azg";

export interface LohnAbwesenheit { art: string; von: string; bis: string; status: string; halbtag: boolean }
export interface LohnPerson {
  id: string; personalnr: number | null; firstName: string; lastName: string; svNummer: string | null; employmentStart: string | null; employmentEnd: string | null;
  beschaeftigung: string | null; weeklyHours: string | number | null; staffType: string;
}
export interface LohnZeile {
  personalNr: string; nachname: string; vorname: string; svNummer: string; eintritt: string; austritt: string; beschaeftigung: string; wochenstunden: number;
  sollStd: number; istStd: number; gutschriftStd: number; saldoStd: number; kontoStd: number; mehrarbeitStd: number; ueberstundenStd: number;
  urlaubTage: number; zeitausgleichTage: number; krankKalendertage: number; krankArbeitstage: number; pflegeTage: number; sonderurlaubTage: number; unbezahltTage: number;
  feiertage: number; abgeschlossen: boolean; hinweis: string;
}

const std = (min: number) => Math.round((min / 60) * 100) / 100;
const plusTage = (datum: string, n: number) => { const d = new Date(datum + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const kalendertage = (von: string, bis: string) => Math.round((Date.parse(bis + "T00:00:00Z") - Date.parse(von + "T00:00:00Z")) / 864e5) + 1;

export function monatsGrenzen(jahr: number, monat: number): { von: string; bis: string } {
  const von = `${jahr}-${String(monat).padStart(2, "0")}-01`;
  const bis = plusTage(`${monat === 12 ? jahr + 1 : jahr}-${String(monat === 12 ? 1 : monat + 1).padStart(2, "0")}-01`, -1);
  return { von, bis };
}

/** Arbeitnehmer:innen im Sinn der Lohnverrechnung (keine Zivis, kein Ehrenamt). */
export function lohnRelevant(p: Pick<LohnPerson, "staffType" | "beschaeftigung">): boolean {
  return p.staffType !== "ZIVILDIENER" && p.staffType !== "EHRENAMT" && p.beschaeftigung !== "ZIVILDIENST" && p.beschaeftigung !== "EHRENAMT";
}

export function lohnZeile(p: {
  person: LohnPerson; auswertung: MonatAuswertung; kontoMin: number; abgeschlossen: boolean;
  abschluss?: { istMin: number; sollMin: number; gutschriftMin: number; saldoMin: number; kontoMin: number; mehrarbeitMin: number; ueberstundenMin: number } | null;
  abwesenheiten: LohnAbwesenheit[]; soll: Record<number, number>; feiertage: Set<string>; jahr: number; monat: number;
}): LohnZeile {
  const { von, bis } = monatsGrenzen(p.jahr, p.monat);
  const tage: Record<string, number> = { URLAUB: 0, ZEITAUSGLEICH: 0, KRANK_K: 0, KRANK_A: 0, PFLEGE: 0, SONDERURLAUB: 0, UNBEZAHLT: 0 };
  for (const a of p.abwesenheiten) {
    if (a.status !== "GENEHMIGT" || a.bis < von || a.von > bis) continue;
    const v = a.von < von ? von : a.von; const b = a.bis > bis ? bis : a.bis;
    const arbeitstage = urlaubstage(v, b, p.soll, p.feiertage, a.halbtag);
    if (a.art === "KRANK") { tage.KRANK_K! += kalendertage(v, b); tage.KRANK_A! += arbeitstage; }
    else if (a.art in tage) tage[a.art]! += arbeitstage;
  }
  // Fester Abschluss hat Vorrang vor der Live-Auswertung (Nachweis § 26 AZG)
  const z = p.abschluss ?? { istMin: p.auswertung.istMin, sollMin: p.auswertung.sollMin, gutschriftMin: p.auswertung.gutschriftMin, saldoMin: p.auswertung.saldoMin, kontoMin: p.kontoMin, mehrarbeitMin: p.auswertung.mehrarbeitMin, ueberstundenMin: p.auswertung.ueberstundenMin };
  const offen = p.auswertung.tage.filter((t) => t.offen).length;
  const hinweise: string[] = [];
  if (!p.abgeschlossen) hinweise.push("Monat nicht abgeschlossen");
  if (offen) hinweise.push(`${offen} Tag(e) ohne Gehen-Stempel`);
  if (p.person.employmentEnd && p.person.employmentEnd >= von && p.person.employmentEnd <= bis) hinweise.push(`Austritt ${p.person.employmentEnd}`);
  if (p.person.employmentStart && p.person.employmentStart >= von && p.person.employmentStart <= bis) hinweise.push(`Eintritt ${p.person.employmentStart}`);
  if (!p.person.svNummer) hinweise.push("SV-Nummer fehlt");

  return {
    personalNr: p.person.personalnr != null ? String(p.person.personalnr) : "", nachname: p.person.lastName, vorname: p.person.firstName, svNummer: p.person.svNummer ?? "",
    eintritt: p.person.employmentStart ?? "", austritt: p.person.employmentEnd ?? "", beschaeftigung: p.person.beschaeftigung ?? "",
    wochenstunden: p.person.weeklyHours ? Number(p.person.weeklyHours) : 0,
    sollStd: std(z.sollMin), istStd: std(z.istMin), gutschriftStd: std(z.gutschriftMin), saldoStd: std(z.saldoMin), kontoStd: std(z.kontoMin),
    mehrarbeitStd: std(z.mehrarbeitMin), ueberstundenStd: std(z.ueberstundenMin),
    urlaubTage: tage.URLAUB!, zeitausgleichTage: tage.ZEITAUSGLEICH!, krankKalendertage: tage.KRANK_K!, krankArbeitstage: tage.KRANK_A!,
    pflegeTage: tage.PFLEGE!, sonderurlaubTage: tage.SONDERURLAUB!, unbezahltTage: tage.UNBEZAHLT!,
    feiertage: p.auswertung.feiertage, abgeschlossen: p.abgeschlossen, hinweis: hinweise.join("; "),
  };
}

export const LOHN_SPALTEN: { key: keyof LohnZeile; label: string }[] = [
  { key: "personalNr", label: "Personal-Nr" }, { key: "nachname", label: "Nachname" }, { key: "vorname", label: "Vorname" }, { key: "svNummer", label: "SV-Nummer" },
  { key: "eintritt", label: "Eintritt" }, { key: "austritt", label: "Austritt" }, { key: "beschaeftigung", label: "Beschäftigung" }, { key: "wochenstunden", label: "Wochenstunden" },
  { key: "sollStd", label: "Soll (h)" }, { key: "istStd", label: "Ist (h)" }, { key: "gutschriftStd", label: "Gutschrift (h)" }, { key: "saldoStd", label: "Monatssaldo (h)" }, { key: "kontoStd", label: "Zeitkonto (h)" },
  { key: "mehrarbeitStd", label: "Mehrarbeit (h)" }, { key: "ueberstundenStd", label: "Überstunden (h)" },
  { key: "urlaubTage", label: "Urlaub (AT)" }, { key: "zeitausgleichTage", label: "Zeitausgleich (AT)" }, { key: "krankKalendertage", label: "Krank (KT)" }, { key: "krankArbeitstage", label: "Krank (AT)" },
  { key: "pflegeTage", label: "Pflegefreistellung (AT)" }, { key: "sonderurlaubTage", label: "Sonderurlaub (AT)" }, { key: "unbezahltTage", label: "Unbezahlt (AT)" },
  { key: "feiertage", label: "Feiertage" }, { key: "abgeschlossen", label: "Abgeschlossen" }, { key: "hinweis", label: "Hinweis" },
];

/** CSV mit Semikolon und Komma als Dezimaltrennzeichen (Excel de-AT), UTF-8 mit BOM. */
export function lohnCsv(zeilen: LohnZeile[]): string {
  const esc = (v: unknown): string => {
    const s = typeof v === "number" ? String(v).replace(".", ",") : typeof v === "boolean" ? (v ? "ja" : "nein") : String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
  };
  return "﻿" + [LOHN_SPALTEN.map((c) => c.label).join(";"), ...zeilen.map((z) => LOHN_SPALTEN.map((c) => esc(z[c.key])).join(";"))].join("\r\n") + "\r\n";
}
