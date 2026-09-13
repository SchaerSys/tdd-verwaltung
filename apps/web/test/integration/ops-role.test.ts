import { beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import { applyMigrations, opsUrl } from "./db";

beforeAll(applyMigrations);

test("tdd_ops kommt an keine Personendaten, aber an Kennzahlen", async () => {
  const sql = postgres(opsUrl(), { max: 1 });
  try {
    for (const table of ["persons", "cards", "distributions", "scan_documents", "antraege"]) {
      await expect(sql.unsafe(`SELECT * FROM ${table} LIMIT 1`)).rejects.toThrow(/permission denied/i);
    }
    const counts = await sql`SELECT * FROM v_system_counts`;
    expect(counts.length).toBe(1);
  } finally {
    await sql.end();
  }
});
