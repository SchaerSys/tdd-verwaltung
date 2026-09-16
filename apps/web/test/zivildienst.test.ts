import { describe, it, expect } from "vitest";
import { volleMonate, werktage, zivildienstEnde, zivildienstKonto } from "../src/lib/zivildienst";

const keine = new Set<string>();
describe("Zivildienst", () => {
  it("Ende = Beginn + 9 Monate − 1 Tag, mit Monatsüberlauf", () => {
    expect(zivildienstEnde("2026-01-01")).toBe("2026-09-30");
    expect(zivildienstEnde("2026-05-31")).toBe("2027-02-27");
    expect(zivildienstEnde("2026-10-01")).toBe("2027-06-30");
  });
  it("volle Monate und Werktage", () => {
    expect(volleMonate("2026-01-01", "2026-03-31")).toBe(3);
    expect(volleMonate("2026-01-01", "2026-03-30")).toBe(2);
    expect(volleMonate("2026-01-01", "2027-01-01")).toBe(9);
    expect(werktage("2026-09-14", "2026-09-20", keine)).toBe(6); // Mo–Sa
    expect(werktage("2026-09-14", "2026-09-14", keine, true)).toBe(0.5);
  });
  it("Konto: Urlaub 2 Werktage je vollem Monat, Fehltage, Verlängerung ab 24", () => {
    const k = zivildienstKonto({ beginn: "2026-01-01", ende: null, fehltageVor: 0 }, [
      { art: "URLAUB", von: "2026-03-02", bis: "2026-03-07", status: "GENEHMIGT", halbtag: false },   // 6 Werktage
      { art: "KRANK", von: "2026-02-01", bis: "2026-02-28", status: "GENEHMIGT", halbtag: false },    // 28 Tage
      { art: "URLAUB", von: "2026-08-03", bis: "2026-08-04", status: "GENEHMIGT", halbtag: false },   // geplant
      { art: "URLAUB", von: "2026-04-01", bis: "2026-04-10", status: "ABGELEHNT", halbtag: false },
    ], keine, "2026-06-15");
    expect(k.endeRegulaer).toBe("2026-09-30");
    expect(k.volleMonate).toBe(5); expect(k.urlaubAnspruch).toBe(10);
    expect(k.urlaubVerbraucht).toBe(6); expect(k.urlaubGeplant).toBe(2); expect(k.urlaubRest).toBe(2);
    expect(k.fehltage).toBe(28); expect(k.verlaengerung).toBe(4); expect(k.endeVoraussichtlich).toBe("2026-10-04");
    expect(k.hinweise.map((h) => h.code)).toContain("VERLAENGERUNG");
  });
  it("laufender Krankenstand über 3 Tage und nahes Ende", () => {
    const k = zivildienstKonto({ beginn: "2026-01-01", ende: null, fehltageVor: 20 }, [
      { art: "KRANK", von: "2026-09-10", bis: "2026-09-20", status: "GENEHMIGT", halbtag: false },
    ], keine, "2026-09-15");
    const codes = k.hinweise.map((h) => h.code);
    expect(codes).toContain("KRANK_BESTAETIGUNG"); expect(codes).toContain("VERLAENGERUNG"); expect(codes).toContain("ENDE_NAH");
    expect(k.fehltage).toBe(26); // 20 vor + 6 bis Stichtag
  });
});

import { ziviMeldeliste, ziviPruefung } from "../src/lib/zivildienst";
describe("ZISA-Vorgaben", () => {
  it("Stammdaten: Wochendienstzeit innerhalb der Grenzen", () => {
    const g = { wocheMinMin: 2160, wocheMaxMin: 2700 };
    expect(ziviPruefung({ ziviBeginn: null, ziviBescheid: null, weeklyHours: null, sollVerteilung: null, employmentEnd: null }, g).map((h) => h.code)).toEqual(["ZIVI_BEGINN", "ZIVI_BESCHEID", "ZIVI_DIENSTZEIT"]);
    expect(ziviPruefung({ ziviBeginn: "2026-01-01", ziviBescheid: "GZ", weeklyHours: "30", sollVerteilung: null, employmentEnd: null }, g).map((h) => h.code)).toEqual(["ZIVI_DIENSTZEIT_GRENZE"]);
    expect(ziviPruefung({ ziviBeginn: "2026-01-01", ziviBescheid: "GZ", weeklyHours: null, sollVerteilung: { 1: 480, 2: 480, 3: 480, 4: 480, 5: 480 }, employmentEnd: null }, g)).toEqual([]);
  });
  it("Meldeliste: Antritt, Krankheit > 3 Tage, Verlängerung, Dienstende", () => {
    const k = zivildienstKonto({ beginn: "2026-01-01", ende: null, fehltageVor: 20 }, [
      { art: "KRANK", von: "2026-03-02", bis: "2026-03-08", status: "GENEHMIGT", halbtag: false },
      { art: "KRANK", von: "2026-04-01", bis: "2026-04-02", status: "GENEHMIGT", halbtag: false },
    ], keine, "2026-09-10");
    const m = ziviMeldeliste(k, [
      { art: "KRANK", von: "2026-03-02", bis: "2026-03-08", status: "GENEHMIGT", halbtag: false },
      { art: "KRANK", von: "2026-04-01", bis: "2026-04-02", status: "GENEHMIGT", halbtag: false },
    ], "2026-09-10");
    expect(m.map((x) => x.art)).toEqual(["DIENSTANTRITT", "KRANK", "VERLAENGERUNG", "DIENSTENDE"]);
  });
  it("Freistellung je Monat ist einstellbar", () => {
    expect(zivildienstKonto({ beginn: "2026-01-01", ende: null, fehltageVor: 0 }, [], keine, "2026-04-15", 3).urlaubAnspruch).toBe(9);
  });
});
