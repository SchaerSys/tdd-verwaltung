import { beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import { applyMigrations, appUrl } from "./db";

beforeAll(applyMigrations);

test("gleicher client_ref bucht die Ausgabe nur einmal", async () => {
  const sql = postgres(appUrl(), { max: 1 });
  try {
    const [loc] = await sql<{ id: number }[]>`
      INSERT INTO locations (name, type, city, location_code)
      VALUES ('Testort', 'AUSGABESTELLE', 'Testdorf', 999)
      ON CONFLICT (name) DO UPDATE SET city = EXCLUDED.city RETURNING id`;
    const [person] = await sql<{ id: string }[]>`
      INSERT INTO persons (first_name, last_name) VALUES ('Test', 'Idempotenz') RETURNING id`;
    const [card] = await sql<{ id: string }[]>`
      INSERT INTO cards (card_number, person_id, location_id, valid_from, valid_to)
      VALUES ('2999000000015', ${person!.id}, ${loc!.id}, current_date, current_date + 180) RETURNING id`;

    const ref = crypto.randomUUID();
    for (let i = 0; i < 2; i++) {
      await sql`INSERT INTO distributions (card_id, person_id, location_id, client_ref)
                VALUES (${card!.id}, ${person!.id}, ${loc!.id}, ${ref})
                ON CONFLICT (client_ref) DO NOTHING`;
    }
    const rows = await sql`SELECT id FROM distributions WHERE client_ref = ${ref}`;
    expect(rows.length).toBe(1);
  } finally {
    await sql.end();
  }
});
