import { sql } from "drizzle-orm";
import { normalizeName, koelnerPhonetik, scoreCandidate, type PersonKey, type Band } from "@tdd/core";
import { db } from "./db";

export interface Candidate {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  location: string | null;
  locationType: string | null;
  score: number;
  band: Band;
}

interface CandidateRow {
  id: string; first_name: string; last_name: string; birth_date: string | null;
  address: string | null; postal_code: string | null; loc_name: string | null; loc_type: string | null;
}

/**
 * Findet mögliche Dubletten zu einer Eingabe: Kandidaten via pg_trgm (%),
 * Kölner Phonetik und exaktem Geburtsdatum, bewertet mit @tdd/core.
 */
export async function findCandidates(input: PersonKey, excludeId?: string): Promise<Candidate[]> {
  const ln = normalizeName(input.lastName);
  if (ln.length < 2) return [];
  const phon = koelnerPhonetik(ln);
  const bd = input.birthDate ?? null;

  const res = await db().execute(sql`
    SELECT p.id, p.first_name, p.last_name, p.birth_date, p.address, p.postal_code,
           l.name AS loc_name, l.type AS loc_type
    FROM persons p
    LEFT JOIN person_location_assignments a ON a.person_id = p.id AND a.is_active
    LEFT JOIN locations l ON l.id = a.location_id
    WHERE p.deleted_at IS NULL
      ${excludeId ? sql`AND p.id <> ${excludeId}` : sql``}
      AND (
        p.last_name_norm % ${ln}
        OR (${phon} <> '' AND p.last_name_phon = ${phon})
        OR (${bd}::date IS NOT NULL AND p.birth_date = ${bd}::date)
      )
    LIMIT 50
  `);

  const rows = res as unknown as CandidateRow[];
  const scored = rows.map((r) => {
    const cand: PersonKey = {
      firstName: r.first_name, lastName: r.last_name, birthDate: r.birth_date,
      address: r.address, postalCode: r.postal_code,
    };
    const result = scoreCandidate(input, cand);
    return {
      id: r.id, name: `${r.first_name} ${r.last_name}`, firstName: r.first_name, lastName: r.last_name,
      birthDate: r.birth_date, location: r.loc_name, locationType: r.loc_type,
      score: result.score, band: result.band,
    } satisfies Candidate;
  });

  return scored
    .filter((c) => c.band !== "NONE")
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export interface DuplicatePair {
  a: { id: string; name: string; birthDate: string | null; location: string | null };
  b: { id: string; name: string; birthDate: string | null; location: string | null };
  score: number;
  band: Band;
}

interface PairRow {
  a_id: string; a_first: string; a_last: string; a_bd: string | null; a_loc: string | null;
  b_id: string; b_first: string; b_last: string; b_bd: string | null; b_loc: string | null;
  b_address: string | null; b_plz: string | null; a_address: string | null; a_plz: string | null;
}

/** Findet wahrscheinliche Dubletten-Paare im gesamten Bestand (Batch). */
export async function findDuplicatePairs(limit = 100): Promise<DuplicatePair[]> {
  const res = await db().execute(sql`
    SELECT a.id AS a_id, a.first_name AS a_first, a.last_name AS a_last, a.birth_date AS a_bd,
           a.address AS a_address, a.postal_code AS a_plz, la.name AS a_loc,
           b.id AS b_id, b.first_name AS b_first, b.last_name AS b_last, b.birth_date AS b_bd,
           b.address AS b_address, b.postal_code AS b_plz, lb.name AS b_loc
    FROM persons a
    JOIN persons b
      ON a.id < b.id
     AND a.deleted_at IS NULL AND b.deleted_at IS NULL
     AND (
       (a.birth_date IS NOT NULL AND a.birth_date = b.birth_date AND a.last_name_norm % b.last_name_norm)
       OR (a.last_name_phon <> '' AND a.last_name_phon = b.last_name_phon AND a.first_name_norm % b.first_name_norm)
     )
    LEFT JOIN person_location_assignments aa ON aa.person_id = a.id AND aa.is_active
    LEFT JOIN locations la ON la.id = aa.location_id
    LEFT JOIN person_location_assignments ab ON ab.person_id = b.id AND ab.is_active
    LEFT JOIN locations lb ON lb.id = ab.location_id
    LIMIT ${limit}
  `);

  const rows = res as unknown as PairRow[];
  const pairs = rows.map((r) => {
    const inputKey: PersonKey = { firstName: r.a_first, lastName: r.a_last, birthDate: r.a_bd, address: r.a_address, postalCode: r.a_plz };
    const candKey: PersonKey = { firstName: r.b_first, lastName: r.b_last, birthDate: r.b_bd, address: r.b_address, postalCode: r.b_plz };
    const s = scoreCandidate(inputKey, candKey);
    return {
      a: { id: r.a_id, name: `${r.a_first} ${r.a_last}`, birthDate: r.a_bd, location: r.a_loc },
      b: { id: r.b_id, name: `${r.b_first} ${r.b_last}`, birthDate: r.b_bd, location: r.b_loc },
      score: s.score, band: s.band,
    } satisfies DuplicatePair;
  });

  return pairs.filter((p) => p.band !== "NONE").sort((a, b) => b.score - a.score);
}
