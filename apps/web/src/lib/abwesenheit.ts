/**
 * Abwesenheiten nach oesterreichischem Recht – reine Berechnungen.
 *  Urlaub (UrlG): 5 Wochen je Urlaubsjahr, 6 ab 25 Dienstjahren; in Arbeitstagen = Wochen ×
 *  Arbeitstage/Woche (fixe Verteilung). Im ersten halben Jahr aliquot (2 Werktage je Monat,
 *  hier anteilig), danach voll; ab dem 2. Jahr voll am Jahresbeginn. Verbrauch in Arbeitstagen
 *  (Solltage laut Verteilung, Feiertage zaehlen nicht). Unverbrauchter Urlaub wird uebertragen
 *  und verjaehrt 2 Jahre nach Ende des Urlaubsjahres, in dem er entstand (§ 4 Abs 5) – aeltester zuerst.
 *  Krankenstand (EFZG § 2): Entgeltfortzahlung je Arbeitsjahr 6/8/10/12 Wochen voll (nach
 *  Dienstjahren <5/≥5/≥15/≥25) plus 4 Wochen halb.
 *  Pflegefreistellung (§ 16 UrlG): eine Woche je Arbeitsjahr.
 */
export interface AbwEintrag { art: string; von: string; bis: string; status?: string; halbtag?: boolean }
export interface PersonUrlaub {
  eintritt: string; austritt?: string | null; urlaubsjahr: "ARBEIT" | "KALENDER"; wochen: 5 | 6;
  uebertragTage: number; uebertragAb: string | null; dienstjahreAnrechnung: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusTage = (datum: string, n: number) => { const d = new Date(datum + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const plusJahre = (datum: string, n: number) => { const d = new Date(datum + "T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + n); return iso(d); };
export const wochentagIso = (datum: string) => { const t = new Date(datum + "T00:00:00Z").getUTCDay(); return t === 0 ? 7 : t; };

/** Urlaubsjahr, in dem ein Datum liegt: [start, ende]. */
export function urlaubsjahr(p: PersonUrlaub, datum: string): { start: string; ende: string; nr: number } {
  if (p.urlaubsjahr === "KALENDER") {
    const j = Number(datum.slice(0, 4));
    return { start: `${j}-01-01`, ende: `${j}-12-31`, nr: j - Number(p.eintritt.slice(0, 4)) + 1 };
  }
  let nr = 1; let start = p.eintritt;
  while (plusJahre(start, 1) <= datum) { start = plusJahre(start, 1); nr++; }
  return { start, ende: plusTage(plusJahre(start, 1), -1), nr };
}

/** Dienstjahre am Stichtag inkl. angerechneter Vordienstzeiten. */
export function dienstjahre(p: PersonUrlaub, stichtag: string): number {
  const ms = new Date(stichtag + "T00:00:00Z").getTime() - new Date(p.eintritt + "T00:00:00Z").getTime();
  return Math.max(0, ms / (365.25 * 864e5)) + p.dienstjahreAnrechnung;
}

/** Arbeitstage je Woche aus der Verteilung (Tage mit Soll), sonst 5. */
export function arbeitstageProWoche(soll: Record<number, number>): number {
  const n = Object.values(soll).filter((m) => m > 0).length;
  return n || 5;
}

/**
 * Anspruch in Arbeitstagen fuer ein Urlaubsjahr: volle Wochen × Arbeitstage; im ersten
 * Dienstjahr in den ersten 6 Monaten aliquot (§ 2 Abs 2 UrlG), ab dem 7. Monat voll.
 * 6 Wochen, wenn am Jahresbeginn 25 Dienstjahre erreicht sind (oder manuell gesetzt).
 */
export function anspruchTage(p: PersonUrlaub, jahrStart: string, stichtag: string, arbeitstageWoche: number): { tage: number; wochen: number; aliquot: boolean } {
  const dj = dienstjahre(p, jahrStart);
  const wochen = p.wochen === 6 || dj >= 25 ? 6 : 5;
  const voll = wochen * arbeitstageWoche;
  const erstesJahr = jahrStart <= p.eintritt || urlaubsjahr(p, jahrStart).nr === 1;
  if (erstesJahr) {
    const sechsMonate = plusTage(plusJahre(p.eintritt, 0), 182);
    if (stichtag < sechsMonate) {
      const monate = Math.max(0, (new Date(stichtag + "T00:00:00Z").getTime() - new Date(p.eintritt + "T00:00:00Z").getTime()) / (30.44 * 864e5));
      return { tage: Math.round((voll * Math.min(monate, 6) / 12) * 2) / 2, wochen, aliquot: true };
    }
  }
  return { tage: voll, wochen, aliquot: false };
}

/** Arbeitstage eines Zeitraums laut Verteilung, Feiertage/betriebsfreie Tage ausgenommen; halber Tag = 0,5. */
export function urlaubstage(von: string, bis: string, soll: Record<number, number>, feiertage: Set<string>, halbtag = false): number {
  let n = 0;
  for (let d = von; d <= bis; d = plusTage(d, 1)) {
    if ((soll[wochentagIso(d)] ?? 0) > 0 && !feiertage.has(d)) n += 1;
  }
  return halbtag ? Math.min(n, 0.5) : n;
}

export interface UrlaubsJahrKonto { start: string; ende: string; anspruch: number; aliquot: boolean; verbraucht: number; rest: number; verfaelltAm: string; verfallen: number }
export interface UrlaubsKonto {
  jahr: { start: string; ende: string; nr: number }; wochen: number; arbeitstageWoche: number;
  anspruch: number; uebertrag: number; verbraucht: number; geplant: number; rest: number;
  verfaelltDemnaechst: { tage: number; am: string } | null; jahre: UrlaubsJahrKonto[];
}

/**
 * Urlaubskonto am Stichtag: Anspruch des laufenden Jahres + Uebertraege (FIFO, 2-Jahres-Verjaehrung).
 * `verbraucht` = genehmigter Urlaub bis Stichtag, `geplant` = genehmigter Urlaub danach.
 */
export function urlaubskonto(p: PersonUrlaub, eintraege: AbwEintrag[], soll: Record<number, number>, feiertage: Set<string>, stichtag: string): UrlaubsKonto {
  const atw = arbeitstageProWoche(soll);
  const laufend = urlaubsjahr(p, stichtag);
  const urlaube = eintraege.filter((e) => e.art === "URLAUB" && (e.status ?? "GENEHMIGT") === "GENEHMIGT");
  // Jahre vom Uebertrag-Start (oder Eintritt) bis zum laufenden
  const ersterStart = p.uebertragAb && p.uebertragAb > p.eintritt ? urlaubsjahr(p, p.uebertragAb).start : urlaubsjahr(p, p.eintritt).start;
  const jahre: UrlaubsJahrKonto[] = [];
  const toepfe: { start: string; ende: string; rest: number; verfaelltAm: string; verfallen: number; anspruch: number; aliquot: boolean; verbraucht: number }[] = [];
  let uebertragStart = 0;
  for (let s = ersterStart; s <= laufend.start; s = urlaubsjahr(p, plusTage(urlaubsjahr(p, s).ende, 1)).start) {
    const j = urlaubsjahr(p, s);
    const a = anspruchTage(p, j.start, s === laufend.start ? stichtag : j.ende, atw);
    let tage = a.tage;
    if (p.uebertragAb && j.start === urlaubsjahr(p, p.uebertragAb).start) tage += p.uebertragTage; // Startwert aus alter Fuehrung
    toepfe.push({ start: j.start, ende: j.ende, rest: tage, verfaelltAm: plusJahre(j.ende, 2), verfallen: 0, anspruch: tage, aliquot: a.aliquot, verbraucht: 0 });
    // Verjaehrung zu Jahresbeginn; danach Uebertrag (Stand am Jahresbeginn) festhalten
    for (const t of toepfe) if (t.verfaelltAm < j.start && t.rest > 0) { t.verfallen += t.rest; t.rest = 0; }
    if (s === laufend.start) uebertragStart = toepfe.slice(0, -1).reduce((x, t) => x + t.rest, 0);
    // Verbrauch dieses Jahres (im laufenden Jahr nur bis Stichtag) FIFO auf die Toepfe buchen, aelteste zuerst
    const bisGrenze = s === laufend.start ? stichtag : j.ende;
    const verbrauchJahr = urlaube.filter((u) => u.von <= bisGrenze && u.bis >= j.start).map((u) => urlaubstage(u.von < j.start ? j.start : u.von, u.bis > bisGrenze ? bisGrenze : u.bis, soll, feiertage, u.halbtag));
    let offen = verbrauchJahr.reduce((x, y) => x + y, 0);
    for (const t of toepfe) {
      const nimm = Math.min(t.rest, offen); t.rest -= nimm; t.verbraucht += nimm; offen -= nimm;
    }
    if (offen > 0) { const letzter = toepfe[toepfe.length - 1]!; letzter.rest -= offen; letzter.verbraucht += offen; } // Vorgriff: geht ins Minus
    if (s === laufend.start) break;
  }
  // Verjaehrung zum Stichtag
  for (const t of toepfe) if (t.verfaelltAm < stichtag && t.rest > 0) { t.verfallen += t.rest; t.rest = 0; }
  const aktuell = toepfe[toepfe.length - 1]!;
  const uebertrag = uebertragStart;
  const verbraucht = urlaube.filter((u) => u.von <= stichtag && u.von >= laufend.start).reduce((x, u) => x + urlaubstage(u.von, u.bis > stichtag ? stichtag : u.bis, soll, feiertage, u.halbtag), 0);
  const geplant = urlaube.filter((u) => u.bis > stichtag).reduce((x, u) => x + urlaubstage(u.von > stichtag ? u.von : plusTage(stichtag, 1), u.bis, soll, feiertage, u.halbtag), 0);
  const naechster = toepfe.filter((t) => t.rest > 0).sort((a, b) => a.verfaelltAm.localeCompare(b.verfaelltAm))[0];
  jahre.push(...toepfe.map((t) => ({ start: t.start, ende: t.ende, anspruch: t.anspruch, aliquot: t.aliquot, verbraucht: t.verbraucht, rest: t.rest, verfaelltAm: t.verfaelltAm, verfallen: t.verfallen })));
  return {
    jahr: laufend, wochen: anspruchTage(p, laufend.start, stichtag, atw).wochen, arbeitstageWoche: atw,
    anspruch: aktuell.anspruch, uebertrag, verbraucht, geplant, rest: toepfe.reduce((x, t) => x + t.rest, 0) - geplant,
    verfaelltDemnaechst: naechster && naechster.start !== laufend.start ? { tage: naechster.rest, am: naechster.verfaelltAm } : null, jahre,
  };
}

/** EFZG § 2: Wochen Entgeltfortzahlung (voll / halb) je Arbeitsjahr nach Dienstjahren. */
export function efzgAnspruch(dj: number): { voll: number; halb: number } {
  return { voll: dj >= 25 ? 12 : dj >= 15 ? 10 : dj >= 5 ? 8 : 6, halb: 4 };
}

/** Krankenstand im Arbeitsjahr: Kalendertage (EFZG rechnet in Wochen = Kalendertagen). */
export function krankenstand(p: PersonUrlaub, eintraege: AbwEintrag[], stichtag: string): { tage: number; faelle: number; anspruchVollTage: number; restVollTage: number; laufender: AbwEintrag | null } {
  const j = urlaubsjahr({ ...p, urlaubsjahr: "ARBEIT" }, stichtag);
  const kranke = eintraege.filter((e) => e.art === "KRANK" && e.von <= j.ende && e.bis >= j.start);
  let tage = 0;
  for (const k of kranke) {
    const von = k.von < j.start ? j.start : k.von; const bis = k.bis > j.ende ? j.ende : k.bis;
    tage += Math.round((new Date(bis + "T00:00:00Z").getTime() - new Date(von + "T00:00:00Z").getTime()) / 864e5) + 1;
  }
  const e = efzgAnspruch(dienstjahre(p, j.start));
  const laufender = kranke.find((k) => k.von <= stichtag && k.bis >= stichtag) ?? null;
  return { tage, faelle: kranke.length, anspruchVollTage: e.voll * 7, restVollTage: Math.max(0, e.voll * 7 - tage), laufender };
}

/** Pflegefreistellung: eine Arbeitswoche je Arbeitsjahr (§ 16 UrlG). */
export function pflegefreistellung(p: PersonUrlaub, eintraege: AbwEintrag[], soll: Record<number, number>, feiertage: Set<string>, stichtag: string): { anspruch: number; verbraucht: number; rest: number } {
  const j = urlaubsjahr({ ...p, urlaubsjahr: "ARBEIT" }, stichtag);
  const anspruch = arbeitstageProWoche(soll);
  const verbraucht = eintraege.filter((e) => e.art === "PFLEGE" && e.von <= j.ende && e.bis >= j.start && (e.status ?? "GENEHMIGT") === "GENEHMIGT")
    .reduce((x, e) => x + urlaubstage(e.von < j.start ? j.start : e.von, e.bis > j.ende ? j.ende : e.bis, soll, feiertage, e.halbtag), 0);
  return { anspruch, verbraucht, rest: Math.max(0, anspruch - verbraucht) };
}

export const ABW_ART_LABEL: Record<string, string> = {
  URLAUB: "Urlaub", KRANK: "Krankenstand", ZEITAUSGLEICH: "Zeitausgleich", PFLEGE: "Pflegefreistellung", SONDERURLAUB: "Sonderurlaub", UNBEZAHLT: "unbezahlt", SONSTIG: "Sonstiges",
};
export const ABW_KURZ: Record<string, string> = { URLAUB: "U", KRANK: "K", ZEITAUSGLEICH: "Z", PFLEGE: "P", SONDERURLAUB: "S", UNBEZAHLT: "–", SONSTIG: "A" };
