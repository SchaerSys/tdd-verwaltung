import { describe, it, expect } from "vitest";
import {
  ean13CheckDigit,
  isValidEan13,
  buildCardNumber,
  formatCardNumber,
} from "../src/ean.js";

describe("EAN-13", () => {
  it("berechnet die Prüfziffer korrekt (bekanntes Beispiel)", () => {
    // 400638133393| -> Prüfziffer 1
    expect(ean13CheckDigit("400638133393")).toBe(1);
  });

  it("baut eine gültige Kartennummer mit Präfix 2", () => {
    const code = buildCardNumber(41, 2511);
    expect(code).toHaveLength(13);
    expect(code.startsWith("2")).toBe(true);
    expect(isValidEan13(code)).toBe(true);
  });

  it("erkennt ungültige Codes (verfälschte Prüfziffer)", () => {
    const code = buildCardNumber(41, 2511);
    const broken = code.slice(0, 12) + String((Number(code[12]) + 1) % 10);
    expect(isValidEan13(broken)).toBe(false);
  });

  it("formatiert leserlich gruppiert", () => {
    const code = buildCardNumber(41, 2511);
    const f = formatCardNumber(code);
    expect(f.startsWith("2 041 00002511 ".slice(0, 5))).toBe(true);
    expect(f.split(" ")).toHaveLength(4);
  });

  it("weist unzulässige Eingaben zurück", () => {
    expect(() => buildCardNumber(1000, 1)).toThrow();
    expect(() => buildCardNumber(1, 10 ** 8)).toThrow();
  });
});
