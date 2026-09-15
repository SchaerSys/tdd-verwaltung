import type { RueckStatus } from "./portal-status";

/** Antrag aus Portal-Sicht, angereichert um Rueckkanal und ungelesene Antworten. */
export interface PortalAntrag {
  id: string; firstName: string; lastName: string; birthDate: string | null; city: string | null;
  status: string; targetType: string; createdAt: Date; decidedAt: Date | null;
  transferredPersonId: string | null; vorgaengerAntragId: string | null; consentGiven: boolean;
  intendedLocationId: number | null; adults: number; childrenU12: number; childrenO12: number;
  neueAntworten: number;           // ungelesene Nachrichten von TDD
  rueck: RueckStatus | null;       // Stand bei TDD (nur bei uebergebenen Faellen)
}

/** Kennzahlen fuer Startseite/Aufgaben. */
export function portalKennzahlen(liste: PortalAntrag[]) {
  const offen = liste.filter((a) => a.status === "OFFEN" || a.status === "IN_PRUEFUNG");
  const positiv = liste.filter((a) => a.status === "POSITIV");
  const negativ = liste.filter((a) => a.status === "NEGATIV");
  const beiTdd = positiv.filter((a) => a.rueck && (a.rueck.stufe === "UEBERGEBEN" || a.rueck.stufe === "UEBERNOMMEN"));
  const versorgt = positiv.filter((a) => a.rueck && (a.rueck.stufe === "KARTE" || a.rueck.stufe === "BEZIEHT" || a.rueck.stufe === "LAEUFT_AB"));
  const faellig = positiv.filter((a) => a.rueck && (a.rueck.stufe === "LAEUFT_AB" || a.rueck.stufe === "ABGELAUFEN"))
    // nur der neueste Antrag je Person zaehlt – ein bereits gestellter Folgeantrag erledigt den Fall
    .filter((a) => !liste.some((b) => b.vorgaengerAntragId === a.id));
  const ohneEinwilligung = offen.filter((a) => !a.consentGiven);
  const neueAntworten = liste.filter((a) => a.neueAntworten > 0);
  return { offen, positiv, negativ, beiTdd, versorgt, faellig, ohneEinwilligung, neueAntworten };
}

export interface PortalStatistik {
  jahr: number;
  gesamt: number; positiv: number; negativ: number; offen: number;
  quote: number | null;                // Anteil positiv an entschiedenen, 0..1
  dauerTage: number | null;            // Ø Tage von Antrag bis Bescheid
  personenVersorgt: number;            // Haushaltsmitglieder positiv beschiedener Antraege
  kinder: number;
  laden: number; ausgabestelle: number;
  aktuellVersorgt: number;             // Karte aktiv (Stand heute, unabhaengig vom Jahr)
  monate: { monat: number; gestellt: number; positiv: number; negativ: number }[];
  orte: { ort: string; n: number }[];  // Wohnorte (fuer Institutionen)
}

/** Kennzahlen eines Jahres, reine Funktion (Test ohne Datenbank). */
export function portalStatistik(liste: PortalAntrag[], jahr: number): PortalStatistik {
  const imJahr = liste.filter((a) => a.createdAt.getFullYear() === jahr);
  const positiv = imJahr.filter((a) => a.status === "POSITIV");
  const negativ = imJahr.filter((a) => a.status === "NEGATIV");
  const entschieden = positiv.length + negativ.length;
  const dauern = imJahr.filter((a) => a.decidedAt).map((a) => (a.decidedAt!.getTime() - a.createdAt.getTime()) / 864e5);
  const monate = Array.from({ length: 12 }, (_, i) => {
    const m = imJahr.filter((a) => a.createdAt.getMonth() === i);
    return { monat: i + 1, gestellt: m.length, positiv: m.filter((a) => a.status === "POSITIV").length, negativ: m.filter((a) => a.status === "NEGATIV").length };
  });
  const orteMap = new Map<string, number>();
  for (const a of imJahr) { const o = (a.city ?? "").trim() || "ohne Ort"; orteMap.set(o, (orteMap.get(o) ?? 0) + 1); }
  const orte = [...orteMap.entries()].map(([ort, n]) => ({ ort, n })).sort((x, y) => y.n - x.n || x.ort.localeCompare(y.ort));
  return {
    jahr, gesamt: imJahr.length, positiv: positiv.length, negativ: negativ.length, offen: imJahr.length - entschieden,
    quote: entschieden ? positiv.length / entschieden : null,
    dauerTage: dauern.length ? Math.round((dauern.reduce((s, x) => s + x, 0) / dauern.length) * 10) / 10 : null,
    personenVersorgt: positiv.reduce((s, a) => s + a.adults + a.childrenU12 + a.childrenO12, 0),
    kinder: positiv.reduce((s, a) => s + a.childrenU12 + a.childrenO12, 0),
    laden: positiv.filter((a) => a.targetType === "LADEN").length,
    ausgabestelle: positiv.filter((a) => a.targetType !== "LADEN").length,
    aktuellVersorgt: liste.filter((a) => a.rueck && (a.rueck.stufe === "KARTE" || a.rueck.stufe === "BEZIEHT" || a.rueck.stufe === "LAEUFT_AB")).length,
    monate, orte,
  };
}
