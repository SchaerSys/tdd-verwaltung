import { eq } from "drizzle-orm";
import { staff } from "@tdd/db";
import { db } from "./db";
import { ladeMonat, ladeRegeln } from "./azg-daten";
import { freieTage, ladeKonten } from "./abwesenheit-daten";
import { zivildienstKonto } from "./zivildienst";
import { plusTage, wochenStart } from "./dienstplan";
import { heuteIso } from "./touren";

/** Daten fürs Zeitkonto-Widget (Dashboard und Mein Bereich) – eigene Person des Logins. */
export interface ZeitkontoWidgetDaten {
  name: string;
  heute: string;
  woche: { start: string; ende: string; istMin: number; gutschriftMin: number; sollMin: number; restMin: number; tage: { datum: string; istMin: number; sollMin: number; gutschriftMin: number }[] };
  kontoMin: number;               // Zeitkonto-Stand (Zeitausgleich verfuegbar) bis heute
  monat: { istMin: number; sollMin: number; saldoMin: number };
  urlaub: { titel: string; anspruch: number; uebertrag: number; verbraucht: number; geplant: number; rest: number; einheit: string; zeitraum: string; verfall: { tage: number; am: string } | null } | null;
  fehlt: string | null;
}

export async function ladeZeitkontoWidget(userId: string): Promise<ZeitkontoWidgetDaten | null> {
  const p = (await db().select().from(staff).where(eq(staff.userId, userId)).limit(1))[0];
  if (!p || !p.isActive) return null;
  const heute = heuteIso();
  const start = wochenStart(heute); const ende = plusTage(start, 6);
  const jahr = Number(heute.slice(0, 4)); const monat = Number(heute.slice(5, 7));
  const vor = new Date(Date.UTC(jahr, monat - 2, 1));
  const brauchtVormonat = start.slice(0, 7) !== heute.slice(0, 7);

  const [aktuell, vormonat, konten, regeln] = await Promise.all([
    ladeMonat(jahr, monat, p.id),
    brauchtVormonat ? ladeMonat(vor.getUTCFullYear(), vor.getUTCMonth() + 1, p.id) : Promise.resolve([]),
    ladeKonten(heute, p.id),
    ladeRegeln(),
  ]);
  const a = aktuell[0]; const k = konten[0];
  const tageAlle = [...(vormonat[0]?.auswertung.tage ?? []), ...(a?.auswertung.tage ?? [])];
  const tage = tageAlle.filter((t) => t.datum >= start && t.datum <= ende).map((t) => ({ datum: t.datum, istMin: t.istMin, sollMin: t.sollMin, gutschriftMin: t.gutschriftMin }));
  const istMin = tage.reduce((s, t) => s + t.istMin, 0);
  const gutschriftMin = tage.reduce((s, t) => s + t.gutschriftMin, 0);
  const sollMin = tage.reduce((s, t) => s + t.sollMin, 0);

  // Zeitkonto bis heute: Stand Monatsende minus die Salden der noch kommenden Tage dieses Monats (die zaehlen als -Soll)
  const kommend = (a?.auswertung.tage ?? []).filter((t) => t.datum > heute).reduce((s, t) => s + t.istMin + t.gutschriftMin - t.sollMin, 0);
  const kontoMin = (a?.kontoMin ?? 0) - kommend;

  let urlaub: ZeitkontoWidgetDaten["urlaub"] = null;
  let fehlt: string | null = null;
  if (p.staffType === "ZIVILDIENER") {
    const beginn = p.ziviBeginn ?? p.employmentStart;
    if (beginn && k) {
      const z = zivildienstKonto({ beginn, ende: p.ziviEnde, fehltageVor: p.ziviFehltageVor }, k.eintraege, await freieTage([jahr - 1, jahr, jahr + 1]), heute, regeln.ziviFreistellungMonat);
      urlaub = { titel: "Dienstfreistellung (ZDG)", anspruch: z.urlaubAnspruch, uebertrag: 0, verbraucht: z.urlaubVerbraucht, geplant: z.urlaubGeplant, rest: z.urlaubRest, einheit: "Werktage", zeitraum: `${z.volleMonate} volle Monate · Dienstende ${z.endeVoraussichtlich}`, verfall: null };
    } else fehlt = "Dienstantritt fehlt";
  } else if (k?.urlaub) {
    urlaub = { titel: "Urlaub (UrlG)", anspruch: k.urlaub.anspruch, uebertrag: k.urlaub.uebertrag, verbraucht: k.urlaub.verbraucht, geplant: k.urlaub.geplant, rest: k.urlaub.rest, einheit: "Tage", zeitraum: `Urlaubsjahr ${k.urlaub.jahr.start} – ${k.urlaub.jahr.ende}`, verfall: k.urlaub.verfaelltDemnaechst };
  } else fehlt = k?.fehlt ?? null;

  return {
    name: `${p.firstName} ${p.lastName}`, heute,
    woche: { start, ende, istMin, gutschriftMin, sollMin, restMin: Math.max(0, sollMin - istMin - gutschriftMin), tage },
    kontoMin, monat: { istMin: a?.auswertung.istMin ?? 0, sollMin: a?.auswertung.sollMin ?? 0, saldoMin: a?.auswertung.saldoMin ?? 0 },
    urlaub, fehlt,
  };
}
