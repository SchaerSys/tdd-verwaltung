import { beforeAll, expect, test } from "vitest";
import { koelnerPhonetik, normalizeName } from "@tdd/core";
import { applyMigrations, appUrl, appSql } from "./db";

beforeAll(async () => {
  await applyMigrations();
  // Der DB-Client der App ist ein Singleton ueber DATABASE_URL – vor dem Import setzen.
  process.env.DATABASE_URL = appUrl();
});

test("Kandidatensuche: SET LOCAL in der Transaktion greift, Trigramm-Treffer kommen", async () => {
  const sql = appSql(1);
  try {
    // Zwei Personen wie im migrierten Bestand: gleicher Name, kein Geburtsdatum, keine Adresse.
    for (const [vor, nach] of [["Maria", "Müller"], ["Maria", "Mueller"]] as const) {
      const ln = normalizeName(nach), fn = normalizeName(vor);
      await sql`INSERT INTO persons (first_name, last_name, last_name_norm, first_name_norm, last_name_phon, first_name_phon)
                VALUES (${vor}, ${nach}, ${ln}, ${fn}, ${koelnerPhonetik(ln)}, ${koelnerPhonetik(fn)})`;
    }
  } finally {
    await sql.end();
  }

  const { findCandidates } = await import("@/lib/dedupe");
  const treffer = await findCandidates({ firstName: "Maria", lastName: "Müller" });

  const namen = treffer.map((t) => `${t.firstName} ${t.lastName}`);
  expect(namen).toContain("Maria Mueller");
  // Ohne Geburtsdatum und Adresse muss ein identischer Name trotzdem HIGH sein (Renormalisierung).
  const mueller = treffer.find((t) => t.lastName === "Mueller");
  expect(mueller?.band).toBe("HIGH");
  expect(mueller?.score).toBe(1);
});
