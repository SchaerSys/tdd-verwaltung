import { describe, it, expect } from "vitest";
import { koelnerWord, koelnerPhonetik } from "../src/phonetik.js";

describe("Kölner Phonetik", () => {
  it("bekannte Referenzwerte", () => {
    expect(koelnerWord("Wikipedia")).toBe("3412");
    expect(koelnerWord("Müller")).toBe("657");
    expect(koelnerWord("Mueller")).toBe("657");
  });

  it("gleich klingende Namensvarianten kollidieren", () => {
    expect(koelnerWord("Maier")).toBe(koelnerWord("Mayer"));
    expect(koelnerWord("Mayer")).toBe(koelnerWord("Meier"));
    expect(koelnerWord("Meyer")).toBe(koelnerWord("Maier"));
  });

  it("verschiedene Namen unterscheiden sich", () => {
    expect(koelnerWord("Müller")).not.toBe(koelnerWord("Huber"));
  });

  it("mehrteilige Namen je Wort", () => {
    expect(koelnerPhonetik("Anna Maier")).toBe("06 67");
  });
});
