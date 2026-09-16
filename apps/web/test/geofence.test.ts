import { describe, it, expect } from "vitest";
import { aufenthalte, ausgelassen, distanzM, naechsteStelle, positionBrauchbar, stillstand, uebergaenge, type Stelle } from "../src/lib/geofence";

const vandans = { lat: 47.0975, lng: 9.8703 };
const spar: Stelle = { key: "a:1", name: "Spar Hard", lat: 47.4830, lng: 9.6890, radiusM: 150, typ: "ABHOLSTELLE", stoppId: "s1" };
const lager: Stelle = { key: "l:990", name: "Lager Vandans", ...vandans, radiusM: 150, typ: "STANDORT", lager: true };
const t = (min: number) => new Date(Date.UTC(2026, 8, 17, 8, min));

describe("Geofence", () => {
  it("Distanz Vandans – Hard ≈ 45 km", () => {
    const d = distanzM(vandans, spar);
    expect(d).toBeGreaterThan(44000); expect(d).toBeLessThan(47000);
  });
  it("verwirft ungenaue Positionen", () => {
    expect(positionBrauchbar({ ...vandans, at: t(0), genauigkeitM: 40 })).toBe(true);
    expect(positionBrauchbar({ ...vandans, at: t(0), genauigkeitM: 400 })).toBe(false);
    expect(positionBrauchbar({ lat: 95, lng: 0, at: t(0), genauigkeitM: null })).toBe(false);
  });
  it("Ankunft bei Eintritt, Abfahrt erst mit Hysterese", () => {
    const stellen = [spar, lager];
    let z = uebergaenge(new Set(), { lat: 47.4830, lng: 9.6900 }, stellen); // ~75 m
    expect(z.ereignisse.map((e) => e.art + e.stelle.key)).toEqual(["ANKUNFTa:1"]);
    z = uebergaenge(z.drinnen, { lat: 47.4830, lng: 9.6913 }, stellen); // ~175 m: innerhalb 1.3 x 150
    expect(z.ereignisse).toEqual([]);
    z = uebergaenge(z.drinnen, { lat: 47.4830, lng: 9.6920 }, stellen); // ~225 m
    expect(z.ereignisse.map((e) => e.art)).toEqual(["ABFAHRT"]);
    expect(z.drinnen.size).toBe(0);
  });
  it("Stillstand nur ausserhalb von Stellen und nach 30 Minuten", () => {
    const start = { ...vandans, lat: 47.2, at: t(0), genauigkeitM: 20 };
    expect(stillstand(start, { ...start, at: t(20) }, new Set())).toBe(false);
    expect(stillstand(start, { ...start, at: t(31) }, new Set())).toBe(true);
    expect(stillstand(start, { ...start, at: t(31) }, new Set(["a:1"]))).toBe(false);
    expect(stillstand(start, { ...start, lng: start.lng + 0.01, at: t(31) }, new Set())).toBe(false);
  });
  it("naechste Stelle", () => {
    expect(naechsteStelle({ lat: 47.1, lng: 9.87 }, [spar, lager])!.stelle.key).toBe("l:990");
  });
  it("Aufenthalte und ausgelassene Stopps", () => {
    const ev = [
      { art: "LAGER_ABFAHRT", stoppId: null, stelleName: "Lager", at: t(0) },
      { art: "ANKUNFT", stoppId: "s2", stelleName: "B", at: t(30) },
      { art: "ABFAHRT", stoppId: "s2", stelleName: "B", at: t(45) },
      { art: "ANKUNFT", stoppId: "s3", stelleName: "C", at: t(60) },
    ];
    const a = aufenthalte(ev, t(70));
    expect(a.map((x) => [x.stelleName, x.minuten, !!x.abfahrt])).toEqual([["B", 15, true], ["C", 10, false]]);
    expect(ausgelassen(["s1", "s2", "s3", "s4"], ev)).toEqual(["s1"]);
  });
});
