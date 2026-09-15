import { describe, expect, test } from "vitest";
import { rueckstatus } from "@/lib/portal-status";

const HEUTE = "2026-09-15";
const person = { takeoverPending: false, deletedAt: null };

describe("Rueckkanal: Stand bei TDD", () => {
  test("ohne Person: nichts zu melden", () => {
    expect(rueckstatus({ person: undefined, karte: undefined, bezuege: 0, letzterBezug: null }, HEUTE).stufe).toBe("KEINE");
  });
  test("uebergeben, Uebernahme ausstehend", () => {
    const r = rueckstatus({ person: { takeoverPending: true, deletedAt: null }, karte: undefined, bezuege: 0, letzterBezug: null }, HEUTE);
    expect(r.stufe).toBe("UEBERGEBEN");
    expect(r.pill).toBe("tag-out");
  });
  test("uebernommen ohne Karte", () => {
    expect(rueckstatus({ person, karte: undefined, bezuege: 0, letzterBezug: null }, HEUTE).stufe).toBe("UEBERNOMMEN");
  });
  test("Karte ausgestellt, noch kein Bezug", () => {
    const r = rueckstatus({ person, karte: { status: "AKTIV", validTo: "2027-03-01" }, bezuege: 0, letzterBezug: null }, HEUTE);
    expect(r.stufe).toBe("KARTE");
    expect(r.text).toContain("01.03.2027");
  });
  test("bezieht", () => {
    const r = rueckstatus({ person, karte: { status: "AKTIV", validTo: "2027-03-01" }, bezuege: 4, letzterBezug: new Date("2026-09-10") }, HEUTE);
    expect(r.stufe).toBe("BEZIEHT");
    expect(r.text).toContain("4");
  });
  test("laeuft in 30 Tagen ab, auch wenn bezogen wird", () => {
    const r = rueckstatus({ person, karte: { status: "AKTIV", validTo: "2026-10-10" }, bezuege: 9, letzterBezug: null }, HEUTE);
    expect(r.stufe).toBe("LAEUFT_AB");
    expect(r.pill).toBe("warn");
  });
  test("Grenze: genau 30 Tage gilt als ablaufend, 31 nicht", () => {
    expect(rueckstatus({ person, karte: { status: "AKTIV", validTo: "2026-10-15" }, bezuege: 0, letzterBezug: null }, HEUTE).stufe).toBe("LAEUFT_AB");
    expect(rueckstatus({ person, karte: { status: "AKTIV", validTo: "2026-10-16" }, bezuege: 0, letzterBezug: null }, HEUTE).stufe).toBe("KARTE");
  });
  test("abgelaufen und gesperrt", () => {
    expect(rueckstatus({ person, karte: { status: "AKTIV", validTo: "2026-09-14" }, bezuege: 0, letzterBezug: null }, HEUTE).stufe).toBe("ABGELAUFEN");
    const g = rueckstatus({ person, karte: { status: "GESPERRT", validTo: "2027-01-01" }, bezuege: 0, letzterBezug: null }, HEUTE);
    expect(g.stufe).toBe("ABGELAUFEN");
    expect(g.text).toBe("Karte gesperrt");
  });
  test("geloescht schlaegt alles", () => {
    expect(rueckstatus({ person: { takeoverPending: true, deletedAt: new Date() }, karte: { status: "AKTIV", validTo: "2027-01-01" }, bezuege: 2, letzterBezug: null }, HEUTE).stufe).toBe("GELOESCHT");
  });
});
