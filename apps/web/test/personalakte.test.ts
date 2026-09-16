import { describe, it, expect } from "vitest";
import { aktePruefung, aufbewahrungBis, probezeitMax, svNummerGueltig, svGeburtsdatumPasst, type AkteDaten } from "../src/lib/personalakte";

const voll: AkteDaten = {
  staffType: "ANGESTELLT", employmentStart: "2026-03-01", employmentEnd: null, beschaeftigung: "TEILZEIT", taetigkeit: "Ausgabe/Büro",
  kvEinstufung: "kein KV", gehaltBrutto: "1800.00", probezeitBis: "2026-03-31", befristetBis: null, kuendigungsfrist: "§ 20 AngG",
  dienstzettelAm: "2026-03-02", geburtsdatum: "1989-05-12", svNummer: "1237120589", notfallName: "Max", weeklyHours: "20", sollVerteilung: { "1": 480 },
  locationId: 1, austrittGrund: null,
};

describe("SV-Nummer", () => {
  it("prüft die Prüfziffer", () => {
    // 1237 120589: 1*3+2*7+3*9 + 1*5+2*8+0*4+5*2+8*1+9*6 = 44+5+16+0+10+8+54 = 137 → 137 mod 11 = 5 → Prüfziffer 7 stimmt nicht
    expect(svNummerGueltig("1237120589")).toBe(false);
    // Prüfziffer 5 passt
    expect(svNummerGueltig("1235120589")).toBe(true);
    expect(svNummerGueltig("1235 120589")).toBe(true);
    expect(svNummerGueltig("12351205")).toBe(false);
    expect(svNummerGueltig(null)).toBe(false);
  });
  it("vergleicht den Datumsteil mit dem Geburtsdatum", () => {
    expect(svGeburtsdatumPasst("1235120589", "1989-05-12")).toBe(true);
    expect(svGeburtsdatumPasst("1235120589", "1989-05-13")).toBe(false);
  });
});

describe("Fristen", () => {
  it("Probezeit höchstens ein Monat, Monatsüberlauf auf Monatsletzten", () => {
    expect(probezeitMax("2026-03-01")).toBe("2026-04-01");
    expect(probezeitMax("2026-01-31")).toBe("2026-02-28");
    expect(probezeitMax("2026-12-15")).toBe("2027-01-15");
  });
  it("Aufbewahrung 7 Jahre ab Jahresende des Austritts", () => {
    expect(aufbewahrungBis("2026-03-15")).toBe("2033-12-31");
  });
});

describe("aktePruefung", () => {
  it("vollständige Akte hat nur die SV-Prüfziffer-Warnung", () => {
    const h = aktePruefung(voll, [{ art: "DIENSTZETTEL", bezeichnung: "DZ", gueltigBis: null }], "2026-09-16");
    expect(h.map((x) => x.code)).toEqual(["SV_UNGUELTIG"]);
  });
  it("fehlende Pflichtangaben werden als FEHLT gemeldet", () => {
    const h = aktePruefung({ ...voll, svNummer: "1235120589", taetigkeit: null, gehaltBrutto: null, dienstzettelAm: null, locationId: null }, [], "2026-09-16");
    const fehlt = h.filter((x) => x.stufe === "FEHLT").map((x) => x.code);
    expect(fehlt).toEqual(["TAETIGKEIT", "GEHALT", "DIENSTORT", "DIENSTZETTEL"]);
    expect(h.some((x) => x.code === "DOK_DIENSTZETTEL" && x.stufe === "INFO")).toBe(true);
  });
  it("Zivildiener und Ehrenamt brauchen keinen Dienstzettel", () => {
    const h = aktePruefung({ ...voll, staffType: "ZIVILDIENER", beschaeftigung: "ZIVILDIENST", taetigkeit: null, gehaltBrutto: null, svNummer: null, dienstzettelAm: null }, [], "2026-09-16");
    expect(h.filter((x) => x.stufe === "FEHLT")).toEqual([]);
  });
  it("Probezeit über einem Monat und ablaufende Fristen warnen", () => {
    const h = aktePruefung({ ...voll, svNummer: "1235120589", probezeitBis: "2026-05-15", befristetBis: "2026-10-30" }, [], "2026-09-16");
    expect(h.map((x) => x.code)).toContain("PROBEZEIT_LANG");
    expect(h.map((x) => x.code)).toContain("BEFRISTUNG_ENDE");
    const h2 = aktePruefung({ ...voll, svNummer: "1235120589", employmentStart: "2026-09-10", probezeitBis: "2026-09-25", dienstzettelAm: "2026-09-10" }, [], "2026-09-16");
    expect(h2.map((x) => x.code)).toContain("PROBEZEIT_ENDE");
  });
  it("abgelaufene und ablaufende Dokumente", () => {
    const h = aktePruefung({ ...voll, svNummer: "1235120589" }, [
      { art: "DIENSTZETTEL", bezeichnung: "DZ", gueltigBis: null },
      { art: "FUEHRERSCHEIN", bezeichnung: "B", gueltigBis: "2026-01-01" },
      { art: "UNTERWEISUNG", bezeichnung: "Hygiene", gueltigBis: "2026-10-01" },
    ], "2026-09-16");
    expect(h.map((x) => x.code)).toEqual(["DOK_ABGELAUFEN", "DOK_LAEUFT_AB"]);
  });
  it("Austritt ohne Beendigungsart ist ein Hinweis, ausgetretene brauchen keinen Dienstzettel mehr", () => {
    const h = aktePruefung({ ...voll, svNummer: "1235120589", employmentEnd: "2026-06-30", dienstzettelAm: null }, [], "2026-09-16");
    expect(h.map((x) => x.code)).toEqual(["AUSTRITT_GRUND"]);
  });
});
