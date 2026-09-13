import { beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import { applyMigrations, appUrl } from "./db";

beforeAll(applyMigrations);

test("RLS trennt Mandanten strikt", async () => {
  const sql = postgres(appUrl(), { max: 1 });
  try {
    const orgs = await sql<{ id: number }[]>`SELECT id FROM organizations WHERE type = 'GEMEINDE' ORDER BY id LIMIT 2`;
    expect(orgs.length).toBe(2);
    const [a, b] = orgs;

    // Antrag im Kontext von Organisation A anlegen
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${String(a!.id)}, true)`;
      await tx`INSERT INTO antraege (organization_id, first_name, last_name)
               VALUES (${a!.id}, 'Test', 'Mandant-A')`;
    });

    // Aus Sicht von Organisation B darf er nicht existieren
    const foreign = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${String(b!.id)}, true)`;
      return tx`SELECT id FROM antraege WHERE last_name = 'Mandant-A'`;
    });
    expect(foreign.length).toBe(0);

    // Ohne Org-Kontext ebenfalls nicht
    const noCtx = await sql`SELECT id FROM antraege WHERE last_name = 'Mandant-A'`;
    expect(noCtx.length).toBe(0);

    // Und aus Sicht von A selbstverstaendlich schon
    const own = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${String(a!.id)}, true)`;
      return tx`SELECT id FROM antraege WHERE last_name = 'Mandant-A'`;
    });
    expect(own.length).toBe(1);
  } finally {
    await sql.end();
  }
});
