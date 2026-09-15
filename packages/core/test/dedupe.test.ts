import { describe, it, expect } from "vitest";
import {
  trigramSimilarity,
  scoreCandidate,
  rankCandidates,
  type PersonKey,
} from "../src/dedupe.js";

const muellerNeu: PersonKey = {
  firstName: "Elisabeth",
  lastName: "Mueller",
  birthDate: "1968-03-14",
  address: "Bahnhofstrasse 12",
  postalCode: "6800",
};

const muellerBestand: PersonKey = {
  firstName: "Elisabeth",
  lastName: "Müller",
  birthDate: "1968-03-14",
  address: "Bahnhofstr. 12",
  postalCode: "6800",
};

describe("trigramSimilarity", () => {
  it("identische Strings = 1", () => {
    expect(trigramSimilarity("mueller", "mueller")).toBe(1);
  });
  it("völlig verschiedene Strings ~ niedrig", () => {
    expect(trigramSimilarity("mueller", "gruber")).toBeLessThan(0.3);
  });
});

describe("scoreCandidate", () => {
  it("Müller vs Mueller (gleiches Geburtsdatum, gleiche Adresse) → HIGH", () => {
    const r = scoreCandidate(muellerNeu, muellerBestand);
    expect(r.band).toBe("HIGH");
    expect(r.score).toBeGreaterThanOrEqual(0.9);
    expect(r.parts.phoneticMatch).toBe(true);
    expect(r.parts.birthDateExact).toBe(true);
  });

  it("gleiches Geburtsdatum allein macht noch keine HIGH-Dublette", () => {
    const fremd: PersonKey = {
      firstName: "Johann",
      lastName: "Gruber",
      birthDate: "1968-03-14",
      address: "Musterweg 1",
      postalCode: "6900",
    };
    const r = scoreCandidate(muellerNeu, fremd);
    expect(r.band).not.toBe("HIGH");
  });

  it("völlig andere Person → NONE", () => {
    const r = scoreCandidate(muellerNeu, {
      firstName: "Amir",
      lastName: "Rahimi",
      birthDate: "1990-11-02",
      address: "Reichsstrasse 4",
      postalCode: "6800",
    });
    expect(r.band).toBe("NONE");
  });
});

describe("rankCandidates", () => {
  it("liefert nur relevante Treffer, bester zuerst", () => {
    const candidates: PersonKey[] = [
      { firstName: "Amir", lastName: "Rahimi", birthDate: "1990-11-02" },
      muellerBestand,
      { firstName: "Elsa", lastName: "Miller", birthDate: "1968-03-14", address: "Reichsstrasse 8", postalCode: "6800" },
    ];
    const ranked = rankCandidates(muellerNeu, candidates);
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked[0]!.candidate.lastName).toBe("Müller");
    // Rahimi darf nicht auftauchen (kein Treffer)
    expect(ranked.some((r) => r.candidate.lastName === "Rahimi")).toBe(false);
  });
});

describe("Renormalisierung bei fehlenden Merkmalen (migrierter Bestand)", () => {
  // Der Altbestand hat kein Geburtsdatum und fast nie eine Adresse.
  const altA: PersonKey = { firstName: "Maria", lastName: "Müller" };
  const altB: PersonKey = { firstName: "Maria", lastName: "Mueller" };

  it("identischer Name ohne Geburtsdatum und Adresse ist HIGH, nicht 0,55", () => {
    const r = scoreCandidate(altA, altB);
    expect(r.score).toBe(1);
    expect(r.band).toBe("HIGH");
  });

  it("aehnlicher Name ohne weitere Merkmale bleibt eine Warnung (MID), keine Sperre", () => {
    const r = scoreCandidate({ firstName: "Hans", lastName: "Maier" }, { firstName: "Hans", lastName: "Mayer" });
    expect(r.band).toBe("MID");
    expect(r.score).toBeGreaterThanOrEqual(0.6);
    expect(r.score).toBeLessThan(0.85);
  });

  it("nur eine Seite mit Geburtsdatum: das Datum faellt aus dem Nenner", () => {
    const neu: PersonKey = { firstName: "Maria", lastName: "Müller", birthDate: "1970-01-01" };
    const r = scoreCandidate(neu, altB);
    expect(r.score).toBe(1);
    expect(r.band).toBe("HIGH");
  });

  it("beide Seiten mit Geburtsdatum: verschiedene Daten druecken wie bisher", () => {
    const a: PersonKey = { firstName: "Maria", lastName: "Müller", birthDate: "1970-01-01" };
    const b: PersonKey = { firstName: "Maria", lastName: "Müller", birthDate: "1985-05-05" };
    const r = scoreCandidate(a, b);
    // 0,35 + 0,15 + 0,05 von 0,85 moeglichen -> 0,65, also MID
    expect(r.band).toBe("MID");
    expect(r.parts.birthDateExact).toBe(false);
  });

  it("voll vergleichbare Personen bewerten sich exakt wie ohne Renormalisierung", () => {
    const a: PersonKey = { firstName: "Amir", lastName: "Rahimi", birthDate: "1990-01-01", address: "Weg 1", postalCode: "6800" };
    const b: PersonKey = { firstName: "Amir", lastName: "Rahimi", birthDate: "1990-01-01", address: "Weg 1", postalCode: "6800" };
    expect(scoreCandidate(a, b).score).toBe(1);
  });
});
