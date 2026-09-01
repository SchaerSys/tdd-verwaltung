import { describe, it, expect } from "vitest";
import { sumValues, incomeLimit, suggest, suggestionLabel } from "@/lib/eligibility";

describe("sumValues", () => {
  it("summiert Werte, ignoriert undefined/NaN", () => {
    expect(sumValues(undefined)).toBe(0);
    expect(sumValues({})).toBe(0);
    expect(sumValues({ a: 100, b: 50.5 })).toBe(150.5);
    expect(sumValues({ a: 100, b: Number.NaN as unknown as number })).toBe(100);
  });
});

describe("incomeLimit", () => {
  it("Einzelperson = 870", () => {
    expect(incomeLimit(1, 0, 0)).toBe(870);
    expect(incomeLimit(0, 0, 0)).toBe(870); // adults||1
  });
  it("weitere Erwachsene je +415", () => {
    expect(incomeLimit(2, 0, 0)).toBe(1285);
    expect(incomeLimit(3, 0, 0)).toBe(1700);
  });
  it("Kinder je +195 (unter/über 12 gleich gewichtet)", () => {
    expect(incomeLimit(1, 2, 0)).toBe(1260);
    expect(incomeLimit(1, 0, 1)).toBe(1065);
  });
  it("gemischter Haushalt", () => {
    // 870 + 2*415 (2 weitere Erwachsene) + 2*195 (2 Kinder) = 2090
    expect(incomeLimit(3, 1, 1)).toBe(2090);
  });
});

describe("suggest", () => {
  it("≤ Grenze → BERECHTIGT (inkl. exakt an der Grenze)", () => {
    expect(suggest(800, 870)).toBe("BERECHTIGT");
    expect(suggest(870, 870)).toBe("BERECHTIGT");
  });
  it("> Grenze, aber ≤ +10 % → HAERTEFALL (inkl. exakt +10 %)", () => {
    expect(suggest(871, 870)).toBe("HAERTEFALL");
    expect(suggest(957, 870)).toBe("HAERTEFALL"); // 870 * 1.1 = 957
  });
  it("> +10 % → NICHT_BERECHTIGT", () => {
    expect(suggest(958, 870)).toBe("NICHT_BERECHTIGT");
    expect(suggest(2000, 870)).toBe("NICHT_BERECHTIGT");
  });
});

describe("suggestionLabel", () => {
  it("liefert lesbare Labels", () => {
    expect(suggestionLabel("BERECHTIGT")).toMatch(/berechtigt/i);
    expect(suggestionLabel("HAERTEFALL")).toMatch(/Härtefall/);
    expect(suggestionLabel("NICHT_BERECHTIGT")).toMatch(/nicht berechtigt/i);
  });
});
