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
