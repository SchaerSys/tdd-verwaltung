import { beforeAll, expect, test } from "vitest";
import { applyMigrations, opsSql } from "./db";

beforeAll(applyMigrations);

test("tdd_ops kommt an keine Personendaten, aber an Kennzahlen", async () => {
  const sql = opsSql(1);
  try {
    for (const table of ["persons", "cards", "distributions", "scan_documents", "antraege"]) {
      await expect(sql.unsafe(`SELECT * FROM ${table} LIMIT 1`)).rejects.toThrow(/permission denied/i);
    }
    const counts = await sql`SELECT * FROM v_system_counts`;
    expect(counts.length).toBe(1);

    // Benutzer verwalten ja – aber weder Passwort-Hash noch TOTP-Geheimnis lesen (Migration 028).
    const sichtbar = await sql`SELECT id, email, role, is_active, totp_enabled FROM users LIMIT 1`;
    expect(Array.isArray(sichtbar)).toBe(true);
    await expect(sql`SELECT password_hash FROM users LIMIT 1`).rejects.toThrow(/permission denied/i);
    await expect(sql`SELECT totp_secret FROM users LIMIT 1`).rejects.toThrow(/permission denied/i);
    await expect(sql`SELECT totp_recovery FROM users LIMIT 1`).rejects.toThrow(/permission denied/i);
    await expect(sql`SELECT * FROM users LIMIT 1`).rejects.toThrow(/permission denied/i);
  } finally {
    await sql.end();
  }
});
