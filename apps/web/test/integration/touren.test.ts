import { beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import { applyMigrations, appUrl, opsUrl } from "./db";

beforeAll(applyMigrations);

/** 034: Touren-Schema, Rolle FAHRER, Vorlage einmal je Tag, Wartung ohne Zugriff auf Touren. */
test("A4: Vorlage nur einmal je Tag, Stopp-Regel, FAHRER-Rolle, ops sieht Fahrzeuge aber keine Touren", async () => {
  const app = postgres(appUrl(), { max: 1 });
  const ops = postgres(opsUrl(), { max: 1 });
  try {
    const st = await app<{ id: number }[]>`INSERT INTO abholstellen (name, art, ort, kuehlbedarf) VALUES ('Test-Markt', 'SUPERMARKT', 'Hard', true) RETURNING id`;
    const fz = await app<{ id: number }[]>`INSERT INTO fahrzeuge (kennzeichen, bezeichnung, kuehlung) VALUES (${"T-" + Date.now()}, 'Testwagen', false) RETURNING id`;
    const vo = await app<{ id: number }[]>`INSERT INTO tour_vorlagen (name, wochentag, fahrzeug_id) VALUES ('Test Montag', 1, ${fz[0]!.id}) RETURNING id`;
    await app`INSERT INTO tour_vorlage_stopps (vorlage_id, reihenfolge, art, abholstelle_id) VALUES (${vo[0]!.id}, 1, 'ABHOLUNG', ${st[0]!.id})`;
    // Stopp-Regel: Lieferung braucht einen Standort, Abholung eine Abholstelle
    await expect(app`INSERT INTO tour_vorlage_stopps (vorlage_id, reihenfolge, art) VALUES (${vo[0]!.id}, 2, 'LIEFERUNG')`).rejects.toThrow();

    // Eine Vorlage hoechstens einmal je Datum
    await app`INSERT INTO touren (datum, vorlage_id, name) VALUES ('2026-09-21', ${vo[0]!.id}, 'Test Montag')`;
    await expect(app`INSERT INTO touren (datum, vorlage_id, name) VALUES ('2026-09-21', ${vo[0]!.id}, 'Test Montag')`).rejects.toThrow(/duplicate|unique/i);
    const zweiter = await app`INSERT INTO touren (datum, vorlage_id, name) VALUES ('2026-09-21', ${vo[0]!.id}, 'x') ON CONFLICT DO NOTHING RETURNING id`;
    expect(zweiter.length).toBe(0);

    // Rolle FAHRER ist erlaubt, Fantasierolle nicht
    const email = `fahrer-${Date.now()}@example.org`;
    await app`INSERT INTO users (email, password_hash, display_name, role) VALUES (${email}, '!', 'Test Fahrer', 'FAHRER')`;
    await expect(app`INSERT INTO users (email, password_hash, display_name, role) VALUES (${"x" + email}, '!', 'X', 'PILOT')`).rejects.toThrow();

    // Wartung: Fahrzeuge ja, Touren/Abholstellen/Abwesenheiten nein
    expect((await ops`SELECT id FROM fahrzeuge WHERE id = ${fz[0]!.id}`).length).toBe(1);
    for (const t of ["touren", "tour_stopps", "abholstellen", "abwesenheiten", "angebote_eingang"]) {
      await expect(ops.unsafe(`SELECT * FROM ${t} LIMIT 1`)).rejects.toThrow(/permission denied/i);
    }
  } finally {
    await app.end();
    await ops.end();
  }
});
