import { describe, expect, test } from "vitest";
import { anspruchTage, efzgAnspruch, krankenstand, pflegefreistellung, urlaubsjahr, urlaubskonto, urlaubstage, type PersonUrlaub } from "@/lib/abwesenheit";
import { feiertage } from "@/lib/feiertage";

const voll: Record<number, number> = { 1: 480, 2: 480, 3: 480, 4: 480, 5: 480, 6: 0, 7: 0 };
const teil: Record<number, number> = { 1: 480, 2: 480, 3: 240, 4: 0, 5: 0, 6: 0, 7: 0 };
const feier = new Set([...feiertage(2025), ...feiertage(2026), ...feiertage(2027)].map((f) => f.datum));
const p = (x: Partial<PersonUrlaub> = {}): PersonUrlaub => ({ eintritt: "2023-03-01", urlaubsjahr: "ARBEIT", wochen: 5, uebertragTage: 0, uebertragAb: null, dienstjahreAnrechnung: 0, ...x });

describe("UrlG", () => {
  test("Urlaubsjahr = Arbeitsjahr ab Eintritt, oder Kalenderjahr", () => {
    expect(urlaubsjahr(p(), "2026-09-16")).toEqual({ start: "2026-03-01", ende: "2027-02-28", nr: 4 });
    expect(urlaubsjahr(p({ urlaubsjahr: "KALENDER" }), "2026-09-16")).toEqual({ start: "2026-01-01", ende: "2026-12-31", nr: 4 });
  });
  test("Anspruch: 25 Arbeitstage bei 5-Tage-Woche, 15 bei 3 Tagen, 30 ab 25 Dienstjahren, aliquot im ersten halben Jahr", () => {
    expect(anspruchTage(p(), "2026-03-01", "2026-09-16", 5).tage).toBe(25);
    expect(anspruchTage(p(), "2026-03-01", "2026-09-16", 3).tage).toBe(15);
    expect(anspruchTage(p({ dienstjahreAnrechnung: 24 }), "2026-03-01", "2026-09-16", 5)).toMatchObject({ tage: 30, wochen: 6 });
    const neu = p({ eintritt: "2026-07-01" });
    expect(anspruchTage(neu, "2026-07-01", "2026-09-16", 5)).toMatchObject({ aliquot: true }); // ~2,5 Monate -> ~5 Tage
    expect(anspruchTage(neu, "2026-07-01", "2026-09-16", 5).tage).toBeGreaterThan(4);
    expect(anspruchTage(neu, "2026-07-01", "2027-01-15", 5)).toMatchObject({ tage: 25, aliquot: false }); // nach 6 Monaten voll
  });
  test("Urlaubstage zaehlen nur Arbeitstage laut Verteilung, Feiertage nicht", () => {
    // Mo 26.10.2026 (Nationalfeiertag) bis Fr 30.10.: 4 Arbeitstage
    expect(urlaubstage("2026-10-26", "2026-10-30", voll, feier)).toBe(4);
    // Teilzeit Mo/Di/Mi: ganze Woche = 3 Tage; halber Tag = 0,5
    expect(urlaubstage("2026-09-14", "2026-09-20", teil, feier)).toBe(3);
    expect(urlaubstage("2026-09-14", "2026-09-14", voll, feier, true)).toBe(0.5);
  });
  test("Konto: Uebertrag FIFO, Verjaehrung nach 2 Jahren, Rest und geplant", () => {
    const person = p({ uebertragTage: 10, uebertragAb: "2025-03-01" }); // Startwert 10 Tage im Jahr 2025/26
    const eintraege = [
      { art: "URLAUB", von: "2025-08-04", bis: "2025-08-08" },          // 5 Tage 2025/26
      { art: "URLAUB", von: "2026-07-06", bis: "2026-07-10" },          // 5 Tage 2026/27
      { art: "URLAUB", von: "2026-12-21", bis: "2026-12-23" },          // geplant: 3 Tage
      { art: "URLAUB", von: "2026-04-01", bis: "2026-04-03", status: "BEANTRAGT" }, // zaehlt nicht
    ];
    const k = urlaubskonto(person, eintraege, voll, feier, "2026-09-16");
    expect(k.jahr.start).toBe("2026-03-01");
    expect(k.anspruch).toBe(25);
    expect(k.uebertrag).toBe(30);           // 2025/26: 25 + 10 Startwert − 5 = 30
    expect(k.verbraucht).toBe(5);
    expect(k.geplant).toBe(3);
    expect(k.rest).toBe(30 + 25 - 5 - 3);   // 47 (Verbrauch FIFO zog vom Uebertrag ab: 30 − 5 = 25 alt + 25 neu)
    expect(k.verfaelltDemnaechst).toEqual({ tage: 25, am: "2028-02-28" });
    // Weit in der Zukunft: der Topf 2025/26 ist verjaehrt
    const spaet = urlaubskonto(person, eintraege, voll, feier, "2028-06-01");
    expect(spaet.jahre.find((j) => j.start === "2025-03-01")?.verfallen).toBeGreaterThan(0);
  });
});

describe("EFZG und Pflegefreistellung", () => {
  test("Entgeltfortzahlung nach Dienstjahren", () => {
    expect(efzgAnspruch(2)).toEqual({ voll: 6, halb: 4 });
    expect(efzgAnspruch(5)).toEqual({ voll: 8, halb: 4 });
    expect(efzgAnspruch(16)).toEqual({ voll: 10, halb: 4 });
    expect(efzgAnspruch(30)).toEqual({ voll: 12, halb: 4 });
  });
  test("Krankenstand im Arbeitsjahr in Kalendertagen, laufender Fall", () => {
    const k = krankenstand(p(), [{ art: "KRANK", von: "2026-04-10", bis: "2026-04-14" }, { art: "KRANK", von: "2026-09-15", bis: "2026-09-18" }], "2026-09-16");
    expect(k.tage).toBe(9);
    expect(k.faelle).toBe(2);
    expect(k.anspruchVollTage).toBe(42);
    expect(k.laufender?.von).toBe("2026-09-15");
  });
  test("Pflegefreistellung eine Arbeitswoche", () => {
    const pf = pflegefreistellung(p(), [{ art: "PFLEGE", von: "2026-05-04", bis: "2026-05-05" }], teil, feier, "2026-09-16");
    expect(pf).toEqual({ anspruch: 3, verbraucht: 2, rest: 1 });
  });
});
