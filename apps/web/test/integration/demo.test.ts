import { describe, it, expect } from "vitest";
import postgres from "postgres";
import { runWithTenant } from "@tdd/db";
import { applyMigrations, adminUrl, appUrl, opsSql, appSql } from "./db";

/**
 * Demo-Mandant (Auftrag 17.09.2026): der komplette Seed laeuft gegen die echten Tabellen und
 * Constraints; danach ist der Demo-Mandant gefuellt und der Bestandsmandant unberuehrt.
 */
describe("Demo-Seed", () => {
  it("baut den Demo-Mandanten vollstaendig auf und laesst Vorarlberg unangetastet", async () => {
    await applyMigrations();
    process.env.DATABASE_URL = appUrl();
    process.env.SESSION_SECRET = "test-geheimnis-mindestens-16-zeichen";
    const ops = opsSql(1);
    const owner = postgres(adminUrl(), { max: 1, onnotice: () => {} });
    const [neu] = await ops`SELECT ops_create_tenant('CareOS Demo', 'demo') AS id`;
    const demo = String(neu!.id);
    await owner`UPDATE tenants SET plan = 'TEST' WHERE id = ${demo}`;
    await ops`SELECT ops_invite_user('admin+demo@example.org', 'Demo Admin', 'ADMIN', NULL, NULL, ${demo}::uuid)`;
    const vorher = (await owner`SELECT count(*)::int AS n FROM persons WHERE tenant_id <> ${demo}`)[0]!.n;
    try {
      const { demoSeed } = await import("../../src/lib/demo-seed");
      const e1 = await runWithTenant(demo, () => demoSeed());
      expect(e1.personen).toBe(20); expect(e1.personal).toBe(6); expect(e1.antraege).toBe(3); expect(e1.ausgaben).toBeGreaterThan(60);
      // zweiter Lauf = Reset: gleiche Zahlen, keine Duplikate
      const e2 = await runWithTenant(demo, () => demoSeed());
      expect(e2.personen).toBe(20);
      const a = appSql(1, demo);
      try {
        expect((await a`SELECT count(*)::int AS n FROM persons`)[0]!.n).toBe(20);
        expect((await a`SELECT count(*)::int AS n FROM cards WHERE status = 'GESPERRT'`)[0]!.n).toBe(1);
        expect((await a`SELECT count(*)::int AS n FROM cards WHERE status = 'ABGELAUFEN'`)[0]!.n).toBe(1);
        expect((await a`SELECT count(*)::int AS n FROM v_schulden`)[0]!.n).toBeGreaterThanOrEqual(2);
        expect((await a`SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'`)[0]!.n).toBe(1); // Admin bleibt
        expect((await a`SELECT count(*)::int AS n FROM users`)[0]!.n).toBe(6);
        expect((await a`SELECT count(*)::int AS n FROM staff WHERE user_id IS NOT NULL`)[0]!.n).toBe(2); // Admin + Fahrer verknuepft
        expect((await a`SELECT count(*)::int AS n FROM touren WHERE status = 'GEPLANT'`)[0]!.n).toBeLessThanOrEqual(1);
        expect((await a`SELECT count(*)::int AS n FROM tour_ereignisse`)[0]!.n).toBeGreaterThan(0);
        expect((await a`SELECT count(*)::int AS n FROM dienste`)[0]!.n).toBeGreaterThan(20);
      } finally { await a.end(); }
      expect((await owner`SELECT count(*)::int AS n FROM persons WHERE tenant_id <> ${demo}`)[0]!.n).toBe(vorher);
      // Im Bestandsmandanten verweigert der Seed
      await expect(runWithTenant("e3b29c11-0000-4000-a000-000000000000", () => demoSeed())).rejects.toThrow(/demo/);
    } finally {
      await owner`DELETE FROM tenants WHERE id = ${demo}`;
      await ops.end(); await owner.end();
    }
  }, 120000);
});
