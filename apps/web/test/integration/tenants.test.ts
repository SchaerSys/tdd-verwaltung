import { describe, it, expect } from "vitest";
import postgres from "postgres";
import { applyMigrations, adminUrl, appSql, opsSql, TENANT } from "./db";

/**
 * Mandantentrennung (053): zwei Mandanten, je ein Pool mit GUC – nichts sickert durch.
 * Owner-Verbindung nur zum Anlegen des zweiten Mandanten (RLS gilt fuer den Owner nicht).
 */
describe("Mandanten-Isolation (RLS ueber tenant_id)", () => {
  it("trennt Daten strikt je Mandant, Inserts erben den Kontext, ohne Kontext scheitern sie", async () => {
    await applyMigrations();
    const owner = postgres(adminUrl(), { max: 1, onnotice: () => {} });
    const zweiter = "b2000000-0000-4000-a000-000000000002";
    await owner`INSERT INTO tenants (id, name, slug) VALUES (${zweiter}, 'Zweiter Verein', 'zweiter') ON CONFLICT DO NOTHING`;
    const a = appSql(1, TENANT);
    const b = appSql(1, zweiter);
    const ohne = postgres(`${adminUrl().replace("tdd_owner", "tdd_app")}`, { max: 1 }); // tdd_app ohne Kontext
    try {
      // Kontext sichtbar
      expect((await a`SELECT current_tenant_id() AS t`)[0]!.t).toBe(TENANT);
      expect((await b`SELECT current_tenant_id() AS t`)[0]!.t).toBe(zweiter);

      // Bestand (Seed 003) gehoert Vorarlberg: Standorte sichtbar fuer A, nicht fuer B
      const locA = await a`SELECT count(*)::int AS n FROM locations`;
      const locB = await b`SELECT count(*)::int AS n FROM locations`;
      expect(locA[0]!.n).toBeGreaterThan(0);
      expect(locB[0]!.n).toBe(0);

      // Inserts erben den Mandanten aus dem Kontext (Spalten-Default)
      const [pA] = await a`INSERT INTO persons (first_name, last_name) VALUES ('Iso', 'Alpha') RETURNING id, tenant_id`;
      const [pB] = await b`INSERT INTO persons (first_name, last_name) VALUES ('Iso', 'Beta') RETURNING id, tenant_id`;
      expect(pA!.tenant_id).toBe(TENANT); expect(pB!.tenant_id).toBe(zweiter);
      expect((await a`SELECT count(*)::int AS n FROM persons WHERE id = ${pB!.id}`)[0]!.n).toBe(0);
      expect((await b`SELECT count(*)::int AS n FROM persons WHERE id = ${pA!.id}`)[0]!.n).toBe(0);
      // Update/Delete ueber die Grenze wirkt nicht
      expect((await b`UPDATE persons SET last_name = 'X' WHERE id = ${pA!.id} RETURNING id`).length).toBe(0);
      expect((await b`DELETE FROM persons WHERE id = ${pA!.id} RETURNING id`).length).toBe(0);
      // Fremden Mandanten explizit setzen: WITH CHECK verweigert
      await expect(b`INSERT INTO persons (first_name, last_name, tenant_id) VALUES ('Fremd', 'X', ${TENANT})`).rejects.toThrow(/row-level security/i);

      // Personal, Touren, Regeln: je Mandant
      const [sA] = await a`INSERT INTO staff (first_name, last_name, personalnr) VALUES ('Iso', 'Staff', 1) RETURNING id`;
      const [sB] = await b`INSERT INTO staff (first_name, last_name, personalnr) VALUES ('Iso', 'Staff', 1) RETURNING id`; // gleiche Nummer, anderer Mandant
      expect(sA && sB).toBeTruthy();
      expect((await b`SELECT count(*)::int AS n FROM staff`)[0]!.n).toBe(1);
      await b`INSERT INTO zeit_regeln DEFAULT VALUES`;
      expect((await b`SELECT tenant_id FROM zeit_regeln`)[0]!.tenant_id).toBe(zweiter);
      expect((await a`SELECT tenant_id FROM zeit_regeln`)[0]!.tenant_id).toBe(TENANT);

      // Ohne Kontext: fail closed – weder lesen noch schreiben
      expect((await ohne`SELECT count(*)::int AS n FROM persons`)[0]!.n).toBe(0);
      await expect(ohne`INSERT INTO persons (first_name, last_name) VALUES ('Ohne', 'Kontext')`).rejects.toThrow();

      // Betreiber sieht beide Mandanten in seinen Sichten (Spaltenrechte bleiben)
      const ops = opsSql(1);
      try {
        const rows = await ops`SELECT DISTINCT tenant_id FROM v_support_mandanten`;
        expect(rows.map((r) => r.tenant_id)).toContain(TENANT);
        await expect(ops`SELECT first_name FROM persons LIMIT 1`).rejects.toThrow(/permission denied/i);
      } finally { await ops.end(); }

      // Portal-Filter greift innerhalb des Mandanten weiter (Organisations-Policy UND Mandant)
      const [orgA] = await a`SELECT id FROM organizations WHERE type = 'GEMEINDE' LIMIT 1`;
      if (orgA) {
        await a.begin(async (tx) => {
          await tx`SELECT set_config('app.org_id', ${String(orgA.id)}, true)`;
          const n = await tx`SELECT count(*)::int AS n FROM antraege WHERE organization_id <> ${orgA.id}`;
          expect(n[0]!.n).toBe(0);
        });
      }

      // Betreiber legt einen Mandanten samt Grundausstattung an (054) – ohne eigenes Schreibrecht auf die Tabellen
      const ops2 = opsSql(1);
      try {
        const [neu] = await ops2`SELECT ops_create_tenant('Dritter Verein', 'dritter') AS id`;
        const dritter = String(neu!.id);
        expect((await owner`SELECT count(*)::int AS n FROM organizations WHERE tenant_id = ${dritter} AND type = 'TDD'`)[0]!.n).toBe(1);
        expect((await owner`SELECT count(*)::int AS n FROM zeit_regeln WHERE tenant_id = ${dritter}`)[0]!.n).toBe(1);
        expect((await owner`SELECT count(*)::int AS n FROM lookup_lists WHERE tenant_id = ${dritter}`)[0]!.n)
          .toBe((await owner`SELECT count(*)::int AS n FROM lookup_lists WHERE tenant_id = ${TENANT}`)[0]!.n);
        await expect(ops2`SELECT ops_create_tenant('Nochmal', 'dritter')`).rejects.toThrow(/duplicate|unique/i);
        await expect(ops2`INSERT INTO organizations (name, type, tenant_id) VALUES ('Direkt', 'TDD', ${dritter})`).rejects.toThrow(/permission denied/i);
        await owner`DELETE FROM tenants WHERE id = ${dritter}`;

        // Anmeldung ohne passenden Host (055): die Fach-App erfaehrt nur den Mandanten des Kontos
        await ops2`SELECT ops_invite_user('login-test@example.org', 'Login Test', 'ADMIN', NULL, NULL, ${zweiter}::uuid)`;
        expect((await a`SELECT tenant_fuer_login('Login-Test@example.org') AS t`)[0]!.t).toBe(zweiter);
        expect((await a`SELECT tenant_fuer_login('login.test') AS t`)[0]!.t).toBe(zweiter); // Benutzername, eindeutig ueber alle Mandanten
        expect((await a`SELECT tenant_fuer_login('gibt-es-nicht@example.org') AS t`)[0]!.t).toBeNull();
        expect((await a`SELECT count(*)::int AS n FROM users WHERE email = 'login-test@example.org'`)[0]!.n).toBe(0); // A sieht das Konto selbst nicht
        await owner`UPDATE tenants SET is_active = false WHERE id = ${zweiter}`;
        expect((await a`SELECT tenant_fuer_login('login-test@example.org') AS t`)[0]!.t).toBeNull(); // deaktivierter Mandant
        await owner`UPDATE tenants SET is_active = true WHERE id = ${zweiter}`;
      } finally { await ops2.end(); }

      // Aufraeumen
      await a`DELETE FROM staff WHERE id = ${sA!.id}`; await a`DELETE FROM persons WHERE id = ${pA!.id}`;
      await owner`DELETE FROM tenants WHERE id = ${zweiter}`; // CASCADE entfernt Beta-Daten
      expect((await owner`SELECT count(*)::int AS n FROM persons WHERE tenant_id = ${zweiter}`)[0]!.n).toBe(0);
    } finally {
      await a.end(); await b.end(); await ohne.end(); await owner.end();
    }
  }, 60000);
});
