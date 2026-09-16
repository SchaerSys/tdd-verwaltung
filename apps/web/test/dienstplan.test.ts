import { describe, it, expect } from "vitest";
import { besetzungPruefung, dienstMinuten, planPruefung, standardAusVerteilung, wocheAusStandard, wochenStart, wochenSummen, type Dienst } from "../src/lib/dienstplan";

const D = (o: Partial<Dienst> & { datum: string; von: string; bis: string }): Dienst =>
  ({ id: o.datum + o.von, staffId: "a", locationId: 1, pauseMin: 0, taetigkeit: "AUSGABE", ...o });
const anna = { id: "a", name: "Anna", soll: { 1: 480, 2: 480, 3: 480, 4: 480, 5: 480 } };

describe("Woche & Standard", () => {
  it("wochenStart liefert den Montag", () => {
    expect(wochenStart("2026-09-16")).toBe("2026-09-14"); // Mittwoch
    expect(wochenStart("2026-09-20")).toBe("2026-09-14"); // Sonntag
    expect(wochenStart("2026-09-14")).toBe("2026-09-14");
  });
  it("Standard aus Verteilung: Beginn 08:00, Pause ab über 6 h", () => {
    const s = standardAusVerteilung({ 1: 480, 2: 360, 3: 240 });
    expect(s["1"]).toEqual({ von: "08:00", bis: "16:30", pause: 30 });
    expect(s["2"]).toEqual({ von: "08:00", bis: "14:00", pause: 0 });
    expect(s["3"]).toEqual({ von: "08:00", bis: "12:00", pause: 0 });
    expect(s["4"]).toBeUndefined();
  });
  it("Woche aus Standard erzeugt Dienste je Wochentag", () => {
    const w = wocheAusStandard("a", { "1": { von: "08:00", bis: "16:30", pause: 30, location: 2 }, "5": { von: "09:00", bis: "13:00" } }, "2026-09-14");
    expect(w.map((d) => d.datum)).toEqual(["2026-09-14", "2026-09-18"]);
    expect(w[0]!.locationId).toBe(2);
    expect(dienstMinuten(w[0]!)).toBe(480);
  });
});

describe("planPruefung", () => {
  const woche = "2026-09-14";
  const feiertage = new Map<string, string>();
  it("saubere Woche: keine Fehler, Sollabweichung als Info", () => {
    const dienste = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"].map((datum) => D({ datum, von: "08:00", bis: "16:30", pauseMin: 30 }));
    const h = planPruefung({ wocheStart: woche, dienste, personen: [anna], abwesenheiten: [], feiertage });
    expect(h).toEqual([]);
    const h2 = planPruefung({ wocheStart: woche, dienste: dienste.slice(0, 3), personen: [anna], abwesenheiten: [], feiertage });
    expect(h2.map((x) => x.code)).toEqual(["SOLL_ABWEICHUNG"]);
  });
  it("Tagesmaximum, Pause, Überschneidung, Ruhezeit", () => {
    const dienste = [
      D({ datum: "2026-09-14", von: "07:00", bis: "18:30", pauseMin: 30 }),          // 11 h netto
      D({ datum: "2026-09-15", von: "08:00", bis: "15:00" }),                        // 7 h ohne Pause
      D({ datum: "2026-09-16", von: "08:00", bis: "12:00" }), D({ datum: "2026-09-16", von: "11:00", bis: "14:00" }),
      D({ datum: "2026-09-17", von: "14:00", bis: "22:00" }), D({ datum: "2026-09-18", von: "06:00", bis: "10:00" }), // 8 h Ruhe
    ];
    const codes = planPruefung({ wocheStart: woche, dienste, personen: [anna], abwesenheiten: [], feiertage }).map((x) => x.code);
    expect(codes).toContain("TAG_MAX"); expect(codes).toContain("PAUSE"); expect(codes).toContain("UEBERLAPPUNG"); expect(codes).toContain("RUHEZEIT");
  });
  it("Ruhezeit zählt auch vom Sonntag der Vorwoche", () => {
    const dienste = [D({ datum: "2026-09-13", von: "16:00", bis: "23:00" }), D({ datum: "2026-09-14", von: "06:00", bis: "10:00" })];
    const h = planPruefung({ wocheStart: woche, dienste, personen: [anna], abwesenheiten: [], feiertage });
    expect(h.some((x) => x.code === "RUHEZEIT" && x.datum === "2026-09-14")).toBe(true);
  });
  it("Abwesenheit, offener Antrag, Feiertag, Sonntag, Wochenmaximum", () => {
    const f = new Map([["2026-09-16", "Testfeiertag"]]);
    const dienste = [1, 2, 3, 4, 5, 6, 7].map((i) => D({ datum: `2026-09-${13 + i}`, von: "08:00", bis: "16:00", pauseMin: 30 }));
    const h = planPruefung({ wocheStart: woche, dienste, personen: [anna], feiertage: f, abwesenheiten: [
      { staffId: "a", von: "2026-09-14", bis: "2026-09-14", art: "URLAUB", status: "GENEHMIGT" },
      { staffId: "a", von: "2026-09-15", bis: "2026-09-15", art: "ZEITAUSGLEICH", status: "BEANTRAGT" },
    ] });
    const codes = h.map((x) => x.code);
    expect(codes).toContain("ABWESEND"); expect(codes).toContain("ANTRAG_OFFEN"); expect(codes).toContain("FEIERTAG"); expect(codes).toContain("SONNTAG"); expect(codes).toContain("WOCHE_MAX");
  });
  it("kein Dienst trotz Soll", () => {
    const h = planPruefung({ wocheStart: woche, dienste: [], personen: [anna], abwesenheiten: [], feiertage });
    expect(h.map((x) => x.code)).toEqual(["KEIN_DIENST"]);
  });
});

describe("Besetzung & Summen", () => {
  it("Öffnungsfenster ohne Ausgabe-Dienst oder mit Lücke", () => {
    const standorte = [{ id: 1, name: "Bludenz", oeffnung: { 1: [{ from: "09:00", to: "12:00" }], 2: [{ from: "09:00", to: "12:00" }], 3: [{ from: "14:00", to: "17:00" }] } }];
    const dienste = [D({ datum: "2026-09-14", von: "08:30", bis: "12:30" }), D({ datum: "2026-09-15", von: "08:30", bis: "11:00" }), D({ datum: "2026-09-16", von: "14:00", bis: "17:00", taetigkeit: "LAGER" })];
    const h = besetzungPruefung({ wocheStart: "2026-09-14", dienste, standorte, feiertage: new Map() });
    expect(h.map((x) => [x.datum, x.schwere])).toEqual([["2026-09-15", "WARNUNG"], ["2026-09-16", "FEHLER"]]);
    expect(h[0]!.text).toContain("ab 11:00");
  });
  it("Wochensummen netto", () => {
    const m = wochenSummen([D({ datum: "2026-09-14", von: "08:00", bis: "16:30", pauseMin: 30 }), D({ datum: "2026-09-21", von: "08:00", bis: "12:00" })], "2026-09-14");
    expect(m.get("a")).toBe(480);
  });
});
