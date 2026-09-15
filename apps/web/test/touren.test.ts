import { describe, expect, test } from "vitest";
import { ampel, datumPlus, konflikte, wochentag, type PlanAbwesenheit, type PlanFahrer, type PlanFahrzeug, type PlanTour } from "@/lib/touren";

const fahrer: PlanFahrer[] = [
  { id: "f1", name: "Anna", kannFahren: true, isActive: true, fahrerTage: [] },
  { id: "f2", name: "Ben", kannFahren: true, isActive: true, fahrerTage: [1, 2, 3] },
  { id: "f3", name: "Cem", kannFahren: false, isActive: false, fahrerTage: [] },
];
const fahrzeuge: PlanFahrzeug[] = [
  { id: 1, kennzeichen: "B-1", kuehlung: true, isActive: true, ausserBetriebVon: null, ausserBetriebBis: null, pickerlBis: "2027-01-01" },
  { id: 2, kennzeichen: "B-2", kuehlung: false, isActive: true, ausserBetriebVon: "2026-09-14", ausserBetriebBis: "2026-09-16", pickerlBis: "2026-01-01" },
];
const tour = (t: Partial<PlanTour>): PlanTour => ({ id: "t1", datum: "2026-09-17", name: "Bludenz", fahrerId: "f1", fahrzeugId: 1, status: "GEPLANT", kuehlbedarf: false, ...t });

describe("A4 Planungslogik", () => {
  test("Wochentag und Datumsrechnung", () => {
    expect(wochentag("2026-09-14")).toBe(1); // Montag
    expect(wochentag("2026-09-20")).toBe(7); // Sonntag
    expect(datumPlus("2026-09-30", 1)).toBe("2026-10-01");
    expect(datumPlus("2026-01-01", -1)).toBe("2025-12-31");
  });
  test("saubere Tour ohne Konflikte", () => {
    expect(konflikte(tour({}), [], fahrer, fahrzeuge, [])).toEqual([]);
  });
  test("fehlende Zuweisungen sind Fehler", () => {
    const k = konflikte(tour({ fahrerId: null, fahrzeugId: null }), [], fahrer, fahrzeuge, []);
    expect(k.map((x) => x.code)).toEqual(["FAHRER_FEHLT", "FAHRZEUG_FEHLT"]);
    expect(ampel(k)).toBe("bad");
  });
  test("Abwesenheit, Werkstatt, Kuehlung, Pickerl", () => {
    const ab: PlanAbwesenheit[] = [{ staffId: "f1", art: "URLAUB", von: "2026-09-15", bis: "2026-09-18" }];
    const k = konflikte(tour({ fahrzeugId: 2, kuehlbedarf: true, datum: "2026-09-15" }), [], fahrer, fahrzeuge, ab);
    const codes = k.map((x) => x.code);
    expect(codes).toContain("FAHRER_ABWESEND");
    expect(codes).toContain("FAHRZEUG_AUSSER_BETRIEB");
    expect(codes).toContain("KUEHLUNG_FEHLT");
    expect(codes).toContain("PICKERL_ABGELAUFEN");
    expect(k.find((x) => x.code === "PICKERL_ABGELAUFEN")?.schwere).toBe("WARNUNG");
  });
  test("Doppelbelegung und Fahrertage sind Warnungen", () => {
    const andere = tour({ id: "t2", name: "Dornbirn", fahrerId: "f2", fahrzeugId: 1 });
    const k = konflikte(tour({ fahrerId: "f2" }), [andere], fahrer, fahrzeuge, []); // Donnerstag, Ben faehrt Mo–Mi
    expect(k.map((x) => x.code).sort()).toEqual(["FAHRER_DOPPELT", "FAHRER_TAG", "FAHRZEUG_DOPPELT"]);
    expect(ampel(k)).toBe("warn");
    // ausgefallene Touren zaehlen nicht als Doppelbelegung
    expect(konflikte(tour({}), [{ ...andere, fahrerId: "f1", status: "AUSGEFALLEN" }], fahrer, fahrzeuge, [])).toEqual([]);
  });
  test("inaktiver Nicht-Fahrer", () => {
    const codes = konflikte(tour({ fahrerId: "f3" }), [], fahrer, fahrzeuge, []).map((x) => x.code);
    expect(codes).toEqual(["FAHRER_INAKTIV", "FAHRER_KEIN_FAHRER"]);
  });
});
