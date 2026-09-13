import { beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import { applyMigrations, appUrl } from "./db";

beforeAll(applyMigrations);

test("Kartennummern-Sequenz: parallele Vergabe ist lueckenlos und kollisionsfrei", async () => {
  // Mehrere Verbindungen, damit die Aufrufe wirklich gleichzeitig laufen.
  const sql = postgres(appUrl(), { max: 8 });
  try {
    const code = 998;
    const laeufe = Array.from({ length: 40 }, () =>
      sql<{ seq: string }[]>`SELECT next_card_sequence(${code}::smallint) AS seq`.then((r) => Number(r[0]!.seq)),
    );
    const nummern = (await Promise.all(laeufe)).sort((a, b) => a - b);

    expect(new Set(nummern).size).toBe(40); // keine Kollision
    expect(nummern[0]).toBe(1); // neuer Standort beginnt bei 1
    expect(nummern[39]).toBe(40); // keine Luecke

    const [stand] = await sql<{ next_value: string }[]>`SELECT next_value FROM card_sequences WHERE location_code = ${code}`;
    expect(Number(stand!.next_value)).toBe(41);
  } finally {
    await sql.end();
  }
});
