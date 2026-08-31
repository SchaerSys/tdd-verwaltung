import { describe, it, expect } from "vitest";
import { foldGerman, normalizeName, normalizeAddress } from "../src/normalize.js";

describe("foldGerman", () => {
  it("faltet Umlaute und ß", () => {
    expect(foldGerman("Müller")).toBe("Mueller");
    expect(foldGerman("Größe")).toBe("Groesse");
    expect(foldGerman("Straße")).toBe("Strasse");
  });
});

describe("normalizeName", () => {
  it("macht Müller und Mueller gleich", () => {
    expect(normalizeName("Müller")).toBe(normalizeName("Mueller"));
    expect(normalizeName("  MÜLLER ")).toBe("mueller");
  });
  it("entfernt Satzzeichen und Mehrfach-Leerzeichen", () => {
    expect(normalizeName("O'Brien-Meier")).toBe("o brien meier");
  });
  it("liefert leeren String bei null/undefined", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
  });
});

describe("normalizeAddress", () => {
  it("vereinheitlicht str. und strasse", () => {
    expect(normalizeAddress("Bahnhofstr. 12")).toBe(normalizeAddress("Bahnhofstrasse 12"));
  });
});
