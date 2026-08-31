/**
 * Dubletten-Scoring.
 *
 * Kandidaten werden in der Datenbank per Trigramm-Index (pg_trgm) und phonetischem
 * Schlüssel vorselektiert; diese reine Funktion bewertet einen Kandidaten und liefert
 * einen Score (0..1) samt Warnband. Dieselbe Trigramm-Metrik (Dice-Koeffizient) wird
 * hier für nachvollziehbare, testbare Bewertung nachgebildet.
 */

import { normalizeName, normalizeAddress } from "./normalize";
import { koelnerPhonetik } from "./phonetik";

export type Band = "HIGH" | "MID" | "NONE";

export interface PersonKey {
  firstName: string;
  lastName: string;
  birthDate?: string | null; // ISO oder beliebig, exakter String-Vergleich
  address?: string | null;
  postalCode?: string | null;
}

export interface CandidateScore {
  score: number;
  band: Band;
  parts: {
    lastName: number;
    firstName: number;
    birthDateExact: boolean;
    address: number;
    phoneticMatch: boolean;
  };
}

const WEIGHTS = {
  lastName: 0.35,
  firstName: 0.15,
  birthDate: 0.3,
  address: 0.15,
  phonetic: 0.05,
} as const;

export const HIGH_THRESHOLD = 0.85;
export const MID_THRESHOLD = 0.6;

/** Trigramm-Menge eines Strings (mit Randmarkierung, wie pg_trgm). */
export function trigrams(input: string): Set<string> {
  const s = `  ${input.trim()} `;
  const out = new Set<string>();
  if (input.trim().length === 0) return out;
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** Trigramm-Ähnlichkeit als Dice-Koeffizient (0..1), analog pg_trgm similarity(). */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

function bandOf(score: number): Band {
  if (score >= HIGH_THRESHOLD) return "HIGH";
  if (score >= MID_THRESHOLD) return "MID";
  return "NONE";
}

/** Bewertet, wie wahrscheinlich `candidate` dieselbe Person wie `input` ist. */
export function scoreCandidate(input: PersonKey, candidate: PersonKey): CandidateScore {
  const inLast = normalizeName(input.lastName);
  const caLast = normalizeName(candidate.lastName);
  const inFirst = normalizeName(input.firstName);
  const caFirst = normalizeName(candidate.firstName);

  const lastSim = trigramSimilarity(inLast, caLast);
  const firstSim = trigramSimilarity(inFirst, caFirst);

  const birthDateExact =
    !!input.birthDate && !!candidate.birthDate && input.birthDate === candidate.birthDate;

  let addrSim = 0;
  if (input.address && candidate.address) {
    const base = trigramSimilarity(normalizeAddress(input.address), normalizeAddress(candidate.address));
    // Gleiche PLZ verstärkt, unterschiedliche PLZ dämpft die Adress-Ähnlichkeit.
    const plzFactor =
      input.postalCode && candidate.postalCode
        ? input.postalCode === candidate.postalCode
          ? 1
          : 0.5
        : 1;
    addrSim = base * plzFactor;
  }

  const phoneticMatch =
    koelnerPhonetik(inLast) !== "" && koelnerPhonetik(inLast) === koelnerPhonetik(caLast);

  const score =
    WEIGHTS.lastName * lastSim +
    WEIGHTS.firstName * firstSim +
    WEIGHTS.birthDate * (birthDateExact ? 1 : 0) +
    WEIGHTS.address * addrSim +
    WEIGHTS.phonetic * (phoneticMatch ? 1 : 0);

  const rounded = Math.round(score * 100) / 100;

  return {
    score: rounded,
    band: bandOf(rounded),
    parts: { lastName: lastSim, firstName: firstSim, birthDateExact, address: addrSim, phoneticMatch },
  };
}

/** Bewertet und sortiert mehrere Kandidaten (bester zuerst), nur Bänder HIGH/MID. */
export function rankCandidates<T extends PersonKey>(
  input: PersonKey,
  candidates: T[],
): Array<{ candidate: T; result: CandidateScore }> {
  return candidates
    .map((candidate) => ({ candidate, result: scoreCandidate(input, candidate) }))
    .filter((r) => r.result.band !== "NONE")
    .sort((a, b) => b.result.score - a.result.score);
}
