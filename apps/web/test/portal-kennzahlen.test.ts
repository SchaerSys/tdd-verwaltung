import { describe, expect, test } from "vitest";
import { portalKennzahlen, portalStatistik, type PortalAntrag } from "@/lib/portal-kennzahlen";
import { rueckstatus } from "@/lib/portal-status";

let n = 0;
function antrag(teil: Partial<PortalAntrag>): PortalAntrag {
  n += 1;
  return {
    id: `a${n}`, firstName: "V", lastName: `N${n}`, birthDate: null, city: null, status: "OFFEN", targetType: "AUSGABESTELLE",
    createdAt: new Date("2026-03-10T10:00:00Z"), decidedAt: null, transferredPersonId: null, vorgaengerAntragId: null, consentGiven: true,
    intendedLocationId: null, adults: 1, childrenU12: 0, childrenO12: 0, neueAntworten: 0, rueck: null, ...teil,
  };
}
const person = { takeoverPending: false, deletedAt: null };
const HEUTE = "2026-09-15";
const versorgt = rueckstatus({ person, karte: { status: "AKTIV", validTo: "2027-01-01" }, bezuege: 2, letzterBezug: null }, HEUTE);
const ablaufend = rueckstatus({ person, karte: { status: "AKTIV", validTo: "2026-09-20" }, bezuege: 2, letzterBezug: null }, HEUTE);
const pending = rueckstatus({ person: { takeoverPending: true, deletedAt: null }, karte: undefined, bezuege: 0, letzterBezug: null }, HEUTE);

describe("Portal-Kennzahlen", () => {
  test("Gruppen und Aufgaben", () => {
    const alt = antrag({ status: "POSITIV", transferredPersonId: "p1", rueck: ablaufend, decidedAt: new Date("2026-03-12T10:00:00Z") });
    const liste = [
      antrag({ status: "OFFEN", consentGiven: false }),
      antrag({ status: "IN_PRUEFUNG", neueAntworten: 2 }),
      antrag({ status: "NEGATIV", decidedAt: new Date("2026-03-15T10:00:00Z") }),
      antrag({ status: "POSITIV", transferredPersonId: "p2", rueck: versorgt, decidedAt: new Date("2026-03-11T10:00:00Z") }),
      antrag({ status: "POSITIV", transferredPersonId: "p3", rueck: pending, decidedAt: new Date("2026-03-11T10:00:00Z") }),
      alt,
    ];
    const k = portalKennzahlen(liste);
    expect(k.offen.length).toBe(2);
    expect(k.ohneEinwilligung.length).toBe(1);
    expect(k.neueAntworten.length).toBe(1);
    expect(k.beiTdd.length).toBe(1);
    expect(k.versorgt.length).toBe(2); // ablaufend zaehlt noch als versorgt
    expect(k.faellig.map((a) => a.id)).toEqual([alt.id]);

    // Verlaengerung gestellt -> nicht mehr faellig
    const mitFolge = [...liste, antrag({ status: "OFFEN", vorgaengerAntragId: alt.id })];
    expect(portalKennzahlen(mitFolge).faellig.length).toBe(0);
  });

  test("Statistik je Jahr", () => {
    const liste = [
      antrag({ status: "POSITIV", createdAt: new Date("2026-02-01T00:00:00Z"), decidedAt: new Date("2026-02-04T00:00:00Z"), adults: 2, childrenU12: 1, childrenO12: 1, targetType: "LADEN", city: "Hard", rueck: versorgt, transferredPersonId: "x" }),
      antrag({ status: "POSITIV", createdAt: new Date("2026-02-20T00:00:00Z"), decidedAt: new Date("2026-02-21T00:00:00Z"), city: "Hard" }),
      antrag({ status: "NEGATIV", createdAt: new Date("2026-05-01T00:00:00Z"), decidedAt: new Date("2026-05-03T00:00:00Z"), city: "Lauterach" }),
      antrag({ status: "OFFEN", createdAt: new Date("2026-06-01T00:00:00Z") }),
      antrag({ status: "POSITIV", createdAt: new Date("2025-12-31T00:00:00Z"), decidedAt: new Date("2026-01-02T00:00:00Z") }), // Vorjahr
    ];
    const s = portalStatistik(liste, 2026);
    expect(s.gesamt).toBe(4);
    expect(s.positiv).toBe(2);
    expect(s.negativ).toBe(1);
    expect(s.offen).toBe(1);
    expect(s.quote).toBeCloseTo(2 / 3);
    expect(s.dauerTage).toBe(2); // (3 + 1 + 2) / 3
    expect(s.personenVersorgt).toBe(5);
    expect(s.kinder).toBe(2);
    expect(s.laden).toBe(1);
    expect(s.ausgabestelle).toBe(1);
    expect(s.aktuellVersorgt).toBe(1);
    expect(s.monate[1]).toEqual({ monat: 2, gestellt: 2, positiv: 2, negativ: 0 });
    expect(s.orte).toEqual([{ ort: "Hard", n: 2 }, { ort: "Lauterach", n: 1 }, { ort: "ohne Ort", n: 1 }]);
    expect(portalStatistik(liste, 2025).gesamt).toBe(1);
  });
});
