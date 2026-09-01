import { describe, it, expect } from "vitest";
import { berechneUrlaub, type UrlaubInput } from "@/lib/urlaub";

const base: UrlaubInput = {
  eintritt: "2020-01-01", stichtag: "2026-12-31", wochenstunden: 38.5, tageWoche: 5,
  jahresWochen: 5, urlaubsjahr: "kalender", aliquot: "monat", verbraucht: 0, uebertrag: 0, mode: "eintritt",
};

describe("berechneUrlaub", () => {
  it("Vollzeit, volles Jahr → 5 Wochen = 192,5 h = 25 Tage", () => {
    const r = berechneUrlaub(base);
    expect(r.ok).toBe(true);
    expect(r.jahresStd).toBeCloseTo(192.5, 2);
    expect(r.restStd).toBeCloseTo(192.5, 2);
    expect(r.restTage).toBeCloseTo(25, 2);
    expect(r.ausmassPct).toBeCloseTo(100, 2);
    expect(r.hProTag).toBeCloseTo(7.7, 2);
  });

  it("Teilzeit 20 h: gleiche 25 Urlaubstage, aber weniger Stunden", () => {
    const r = berechneUrlaub({ ...base, wochenstunden: 20 });
    expect(r.jahresStd).toBeCloseTo(100, 2);
    expect(r.restTage).toBeCloseTo(25, 2);
    expect(r.hProTag).toBeCloseTo(4, 2);
    expect(r.ausmassPct).toBeCloseTo((20 / 38.5) * 100, 1);
  });

  it("Eintritt Jahresmitte, Kalenderjahr, monatsweise → 6/12", () => {
    const r = berechneUrlaub({ ...base, eintritt: "2026-07-01" });
    expect(r.anspruchStd).toBeCloseTo(96.25, 2); // 192,5 * 6/12
    expect(r.restStd).toBeCloseTo(96.25, 2);
  });

  it("Übertrag & Verbrauch werden verrechnet", () => {
    const r = berechneUrlaub({ ...base, verbraucht: 77, uebertrag: 15.4 });
    expect(r.restStd).toBeCloseTo(192.5 + 15.4 - 77, 2);
  });

  it("negativer Rest bei Vorgriff", () => {
    const r = berechneUrlaub({ ...base, eintritt: "2026-07-01", verbraucht: 120 });
    expect(r.restStd).toBeLessThan(0);
  });

  it("Fehler bei Stichtag vor Eintritt", () => {
    const r = berechneUrlaub({ ...base, eintritt: "2026-01-01", stichtag: "2025-12-31" });
    expect(r.ok).toBe(false);
  });
});
