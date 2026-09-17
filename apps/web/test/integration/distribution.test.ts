import { beforeAll, expect, test } from "vitest";
import { applyMigrations, appSql } from "./db";

beforeAll(applyMigrations);

test("gleicher client_ref bucht die Ausgabe nur einmal", async () => {
  const sql = appSql(1);
  try {
    const [loc] = await sql<{ id: number }[]>`
      INSERT INTO locations (name, type, city, location_code)
      VALUES ('Testort', 'AUSGABESTELLE', 'Testdorf', 999)
      ON CONFLICT (tenant_id, name) DO UPDATE SET city = EXCLUDED.city RETURNING id`;
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

test("Schulden (056): Ausgabe ohne Zahlung erzeugt Ausstand, Erlass senkt ihn ohne Geldfluss, v_schulden zeigt nur offene", async () => {
  const sql = appSql(1);
  try {
    const [loc] = await sql<{ id: number }[]>`SELECT id FROM locations WHERE name = 'Testort' LIMIT 1`;
    const [person] = await sql<{ id: string }[]>`INSERT INTO persons (first_name, last_name) VALUES ('Schuld', 'Test') RETURNING id`;
    await sql`INSERT INTO person_location_assignments (person_id, location_id) VALUES (${person!.id}, ${loc!.id})`;
    const [card] = await sql<{ id: string }[]>`
      INSERT INTO cards (card_number, person_id, location_id, valid_from, valid_to)
      VALUES ('2999000000022', ${person!.id}, ${loc!.id}, current_date, current_date + 180) RETURNING id`;
    // zwei Ausgaben: einmal Geld vergessen (4 offen), einmal nur heute bezahlt
    await sql`INSERT INTO distributions (card_id, person_id, location_id, amount_due, amount_paid) VALUES (${card!.id}, ${person!.id}, ${loc!.id}, 4.00, 0)`;
    await sql`INSERT INTO distributions (card_id, person_id, location_id, amount_due, amount_paid) VALUES (${card!.id}, ${person!.id}, ${loc!.id}, 4.00, 4.00)`;
    let [v] = await sql<{ offen: string; offene_ausgaben: number }[]>`SELECT offen, offene_ausgaben::int AS offene_ausgaben FROM v_schulden WHERE person_id = ${person!.id}`;
    expect(Number(v!.offen)).toBe(4); expect(v!.offene_ausgaben).toBe(1);
    // Erlass (Buero): faellig negativ, kein Geld
    await sql`INSERT INTO distributions (card_id, person_id, location_id, amount_due, amount_paid, buchungsart, note) VALUES (${card!.id}, ${person!.id}, ${loc!.id}, -4.00, 0, 'ERLASS', 'Erlass: Test')`;
    [v] = await sql<{ offen: string; offene_ausgaben: number }[]>`SELECT offen, offene_ausgaben::int AS offene_ausgaben FROM v_schulden WHERE person_id = ${person!.id}`;
    expect(v).toBeUndefined(); // ausgeglichen → nicht mehr in der Liste
    const [einnahmen] = await sql<{ s: string }[]>`SELECT coalesce(sum(amount_paid), 0) AS s FROM distributions WHERE person_id = ${person!.id}`;
    expect(Number(einnahmen!.s)).toBe(4); // Erlass ist keine Einnahme
    await expect(sql`INSERT INTO distributions (card_id, person_id, location_id, buchungsart) VALUES (${card!.id}, ${person!.id}, ${loc!.id}, 'UNSINN')`).rejects.toThrow();
  } finally {
    await sql.end();
  }
});
