/**
 * P6 · Zivildienst – reine Logik ohne Datenbank.
 *
 * Zivildienstleistende stehen nicht im Arbeitsverhältnis; es gilt das Zivildienstgesetz (ZDG):
 *  - Dauer 9 Monate ab Dienstantritt (§ 7 ZDG).
 *  - Dienstfreistellung („Urlaub“) zwei Werktage je vollem Monat (§ 23a ZDG); Werktag = Mo–Sa
 *    ohne Feiertag. Anspruch entsteht mit jedem vollen Monat.
 *  - Verhinderung (Krankheit u. a.) über insgesamt 24 Tage verlängert den Zivildienst um die
 *    darüber hinausgehende Zeit (§ 21 ZDG). Fehltage aus einer früheren Einsatzstelle zählen mit.
 *  - Krankheit ist der Einsatzstelle unverzüglich zu melden; länger als drei Tage nur mit
 *    ärztlicher Bestätigung (Meldung an die Zivildienstserviceagentur bei Verlängerung).
 */
import { wochentagIso } from "./abwesenheit";

export interface ZiviDaten { beginn: string; ende: string | null; fehltageVor: number }
export interface ZiviEintrag { art: string; von: string; bis: string; status: string; halbtag: boolean }

export interface ZiviKonto {
  beginn: string; endeRegulaer: string; endeVoraussichtlich: string;
  tageGesamt: number; tageGeleistet: number; fortschritt: number;      // 0..1
  volleMonate: number; urlaubAnspruch: number; urlaubVerbraucht: number; urlaubGeplant: number; urlaubRest: number;
  fehltage: number; fehltageFrei: number; verlaengerung: number;
  krankLaufend: ZiviEintrag | null; hinweise: { code: string; stufe: "FEHLT" | "WARN" | "INFO"; text: string }[];
}

const plusTage = (datum: string, n: number) => { const d = new Date(datum + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tageZwischen = (von: string, bis: string) => Math.round((Date.parse(bis + "T00:00:00Z") - Date.parse(von + "T00:00:00Z")) / 864e5) + 1;

/** Reguläres Ende: Beginn + 9 Monate − 1 Tag (Monatsüberlauf auf den Monatsletzten). */
export function zivildienstEnde(beginn: string, monate = 9): string {
  const d = new Date(beginn + "T00:00:00Z");
  const zielMonat = d.getUTCMonth() + monate;
  d.setUTCMonth(zielMonat);
  if (d.getUTCMonth() !== ((zielMonat % 12) + 12) % 12) d.setUTCDate(0);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Volle Monate zwischen Beginn und Stichtag (inklusiv), höchstens `max`. */
export function volleMonate(beginn: string, stichtag: string, max = 9): number {
  if (stichtag < beginn) return 0;
  let n = 0;
  while (n < max) {
    const d = new Date(beginn + "T00:00:00Z");
    const m = d.getUTCMonth() + n + 1;
    d.setUTCMonth(m);
    if (d.getUTCMonth() !== ((m % 12) + 12) % 12) d.setUTCDate(0);
    const monatsEnde = plusTage(d.toISOString().slice(0, 10), -1);
    if (monatsEnde > stichtag) break;
    n++;
  }
  return n;
}

/** Werktage (Mo–Sa ohne Feiertag) in einem Zeitraum. */
export function werktage(von: string, bis: string, feiertage: Set<string>, halbtag = false): number {
  let n = 0;
  for (let d = von; d <= bis; d = plusTage(d, 1)) if (wochentagIso(d) !== 7 && !feiertage.has(d)) n += 1;
  return halbtag && n > 0 ? 0.5 : n;
}

const ueberschneidung = (aVon: string, aBis: string, bVon: string, bBis: string): [string, string] | null => {
  const von = aVon > bVon ? aVon : bVon; const bis = aBis < bBis ? aBis : bBis;
  return von <= bis ? [von, bis] : null;
};

export function zivildienstKonto(p: ZiviDaten, eintraege: ZiviEintrag[], feiertage: Set<string>, stichtag: string): ZiviKonto {
  const endeRegulaer = p.ende ?? zivildienstEnde(p.beginn);
  const genehmigt = eintraege.filter((e) => e.status === "GENEHMIGT");
  const imDienst = (e: ZiviEintrag) => ueberschneidung(e.von, e.bis, p.beginn, endeRegulaer);

  // Fehltage: Verhinderung ausser Dienstfreistellung (Urlaub) und Zeitausgleich – Kalendertage
  let fehltage = p.fehltageVor;
  for (const e of genehmigt) {
    if (e.art === "URLAUB" || e.art === "ZEITAUSGLEICH" || e.art === "SONDERURLAUB") continue;
    const o = imDienst(e); if (!o) continue;
    const bis = o[1] < stichtag ? o[1] : stichtag;
    if (o[0] <= bis) fehltage += tageZwischen(o[0], bis);
  }
  const verlaengerung = Math.max(0, fehltage - 24);
  const endeVoraussichtlich = plusTage(endeRegulaer, verlaengerung);

  const monate = volleMonate(p.beginn, stichtag);
  const urlaubAnspruch = monate * 2;
  let urlaubVerbraucht = 0, urlaubGeplant = 0;
  for (const e of genehmigt.filter((x) => x.art === "URLAUB")) {
    const o = imDienst(e); if (!o) continue;
    if (o[0] <= stichtag) urlaubVerbraucht += werktage(o[0], o[1] < stichtag ? o[1] : stichtag, feiertage, e.halbtag);
    if (o[1] > stichtag) urlaubGeplant += werktage(o[0] > stichtag ? o[0] : plusTage(stichtag, 1), o[1], feiertage, e.halbtag);
  }
  const urlaubRest = urlaubAnspruch - urlaubVerbraucht - urlaubGeplant;

  const tageGesamt = tageZwischen(p.beginn, endeVoraussichtlich);
  const tageGeleistet = stichtag < p.beginn ? 0 : Math.min(tageGesamt, tageZwischen(p.beginn, stichtag));
  const krankLaufend = genehmigt.find((e) => e.art === "KRANK" && e.von <= stichtag && e.bis >= stichtag) ?? null;

  const hinweise: ZiviKonto["hinweise"] = [];
  if (krankLaufend && tageZwischen(krankLaufend.von, stichtag) > 3) hinweise.push({ code: "KRANK_BESTAETIGUNG", stufe: "WARN", text: `Krank seit ${krankLaufend.von} (${tageZwischen(krankLaufend.von, stichtag)} Tage) – ärztliche Bestätigung an die Einsatzstelle, Fehltage an die Zivildienstserviceagentur melden.` });
  if (verlaengerung > 0) hinweise.push({ code: "VERLAENGERUNG", stufe: "WARN", text: `${fehltage} Fehltage – Zivildienst verlängert sich um ${verlaengerung} Tag(e) auf ${endeVoraussichtlich} (§ 21 ZDG); Agentur informieren.` });
  else if (fehltage >= 18) hinweise.push({ code: "FEHLTAGE_NAH", stufe: "INFO", text: `${fehltage} von 24 Fehltagen ohne Verlängerung verbraucht.` });
  if (urlaubRest < 0) hinweise.push({ code: "URLAUB_UEBER", stufe: "WARN", text: `Dienstfreistellung um ${-urlaubRest} Werktag(e) über dem bisher entstandenen Anspruch (${urlaubAnspruch}).` });
  const restTage = tageZwischen(stichtag, endeVoraussichtlich) - 1;
  if (restTage >= 0 && restTage <= 30) hinweise.push({ code: "ENDE_NAH", stufe: "INFO", text: `Dienstende in ${restTage} Tag(en) – Abmeldung, Dienstzeugnis/Bestätigung und Resturlaub (${urlaubRest} Werktage) klären.` });
  if (stichtag > endeVoraussichtlich) hinweise.push({ code: "BEENDET", stufe: "INFO", text: `Zivildienst am ${endeVoraussichtlich} beendet – Personal-Datensatz deaktivieren.` });

  return {
    beginn: p.beginn, endeRegulaer, endeVoraussichtlich, tageGesamt, tageGeleistet, fortschritt: tageGesamt ? Math.min(1, tageGeleistet / tageGesamt) : 0,
    volleMonate: monate, urlaubAnspruch, urlaubVerbraucht, urlaubGeplant, urlaubRest,
    fehltage, fehltageFrei: Math.max(0, 24 - fehltage), verlaengerung, krankLaufend, hinweise,
  };
}
