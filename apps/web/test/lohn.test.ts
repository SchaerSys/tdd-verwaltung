import { describe, it, expect } from "vitest";
import { lohnCsv, lohnRelevant, lohnZeile, monatsGrenzen } from "../src/lib/lohn";
import type { MonatAuswertung } from "../src/lib/azg";

const aus: MonatAuswertung = { jahr: 2026, monat: 9, tage: [{ datum: "2026-09-30", wochentag: 3, sollMin: 480, istMin: 0, breakMin: 0, gutschriftMin: 0, gutschriftGrund: null, kommen: "08:00", gehen: null, offen: true, warnungen: [] }], wochen: [],
  istMin: 9000, sollMin: 9600, gutschriftMin: 480, saldoMin: -120, mehrarbeitMin: 90, ueberstundenMin: 0, warnungen: [], feiertage: 0, abwesenheitstage: 1 };
const person = { id: "abcdef12-3456", firstName: "Anna", lastName: "Muster", svNummer: "1235120589", employmentStart: "2025-01-01", employmentEnd: null, beschaeftigung: "TEILZEIT", weeklyHours: "30", staffType: "ANGESTELLT" };
const soll = { 1: 480, 2: 480, 3: 480, 4: 240, 5: 0 };

describe("Lohnexport", () => {
  it("Monatsgrenzen", () => { expect(monatsGrenzen(2026, 2)).toEqual({ von: "2026-02-01", bis: "2026-02-28" }); expect(monatsGrenzen(2026, 12).bis).toBe("2026-12-31"); });
  it("Zivis und Ehrenamt fallen raus", () => { expect(lohnRelevant({ staffType: "ZIVILDIENER", beschaeftigung: null })).toBe(false); expect(lohnRelevant(person)).toBe(true); });
  it("Zeile: Stunden, Abwesenheitstage je Art im Monat, Hinweise", () => {
    const z = lohnZeile({ person, auswertung: aus, kontoMin: 300, abgeschlossen: false, abwesenheiten: [
      { art: "URLAUB", von: "2026-08-31", bis: "2026-09-02", status: "GENEHMIGT", halbtag: false },   // Mo(Aug) Di Mi -> 2 AT im Sept
      { art: "KRANK", von: "2026-09-14", bis: "2026-09-20", status: "GENEHMIGT", halbtag: false },    // 7 KT, 4 AT (Mo–Do)
      { art: "UNBEZAHLT", von: "2026-09-21", bis: "2026-09-21", status: "GENEHMIGT", halbtag: false },
      { art: "URLAUB", von: "2026-09-25", bis: "2026-09-25", status: "BEANTRAGT", halbtag: false },
    ], soll, feiertage: new Set(), jahr: 2026, monat: 9 });
    expect(z.istStd).toBe(150); expect(z.sollStd).toBe(160); expect(z.saldoStd).toBe(-2); expect(z.kontoStd).toBe(5); expect(z.mehrarbeitStd).toBe(1.5);
    expect(z.urlaubTage).toBe(2); expect(z.krankKalendertage).toBe(7); expect(z.krankArbeitstage).toBe(4); expect(z.unbezahltTage).toBe(1);
    expect(z.hinweis).toContain("nicht abgeschlossen"); expect(z.hinweis).toContain("ohne Gehen-Stempel");
  });
  it("fester Abschluss hat Vorrang; CSV mit Komma-Dezimal und BOM", () => {
    const z = lohnZeile({ person, auswertung: aus, kontoMin: 300, abgeschlossen: true, abschluss: { istMin: 9030, sollMin: 9600, gutschriftMin: 480, saldoMin: -90, kontoMin: 330, mehrarbeitMin: 0, ueberstundenMin: 0 }, abwesenheiten: [], soll, feiertage: new Set(), jahr: 2026, monat: 9 });
    expect(z.istStd).toBe(150.5); expect(z.hinweis).toBe("1 Tag(e) ohne Gehen-Stempel");
    const csv = lohnCsv([z]);
    expect(csv.startsWith("\uFEFFPersonal-Nr;Nachname")).toBe(true);
    expect(csv).toContain(";150,5;");
    expect(csv).toContain(";ja;");
  });
});
