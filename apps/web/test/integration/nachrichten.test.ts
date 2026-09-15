import { beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import { applyMigrations, appUrl } from "./db";

beforeAll(applyMigrations);

/** 031: Nachrichten sind je Organisation getrennt, TDD (ohne Org-Kontext) sieht alle; Owner-View liefert den Fall. */
test("Rueckfragen: RLS je Organisation, TDD sieht alles, View nur Faelle mit Verlauf", async () => {
  const sql = postgres(appUrl(), { max: 1 });
  try {
    const orgs = await sql<{ id: number }[]>`SELECT id FROM organizations WHERE type = 'GEMEINDE' ORDER BY id LIMIT 2`;
    const [a, b] = orgs;

    const antragId = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${String(a!.id)}, true)`;
      const r = await tx<{ id: string }[]>`INSERT INTO antraege (organization_id, first_name, last_name, email)
               VALUES (${a!.id}, 'Rueck', 'Frage-A', 'x@example.org') RETURNING id`;
      await tx`INSERT INTO antrag_nachrichten (antrag_id, organization_id, seite, text) VALUES (${r[0]!.id}, ${a!.id}, 'ORG', 'Ist die Person bekannt?')`;
      return r[0]!.id;
    });

    // Organisation B sieht die Nachricht nicht und kann keine fuer A schreiben
    const fremd = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${String(b!.id)}, true)`;
      return tx`SELECT id FROM antrag_nachrichten WHERE antrag_id = ${antragId}`;
    });
    expect(fremd.length).toBe(0);
    await expect(sql.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${String(b!.id)}, true)`;
      await tx`INSERT INTO antrag_nachrichten (antrag_id, organization_id, seite, text) VALUES (${antragId}, ${a!.id}, 'ORG', 'fremd')`;
    })).rejects.toThrow();

    // TDD ohne Org-Kontext: sieht die Nachricht und den Fall in der View, aber weiterhin nicht den Antrag
    const tdd = await sql`SELECT text FROM antrag_nachrichten WHERE antrag_id = ${antragId}`;
    expect(tdd.length).toBe(1);
    const fall = await sql<{ last_name: string; ungelesen: number }[]>`SELECT last_name, ungelesen FROM v_rueckfragen_tdd WHERE antrag_id = ${antragId}`;
    expect(fall[0]?.last_name).toBe("Frage-A");
    expect(Number(fall[0]?.ungelesen)).toBe(1);
    const antrag = await sql`SELECT id FROM antraege WHERE id = ${antragId}`;
    expect(antrag.length).toBe(0);

    // Antwort von TDD, Organisation A sieht beide
    await sql`INSERT INTO antrag_nachrichten (antrag_id, organization_id, seite, text) VALUES (${antragId}, ${a!.id}, 'TDD', 'Ja, seit 2024.')`;
    const eigene = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${String(a!.id)}, true)`;
      return tx`SELECT seite FROM antrag_nachrichten WHERE antrag_id = ${antragId} ORDER BY created_at`;
    });
    expect(eigene.map((r) => r.seite)).toEqual(["ORG", "TDD"]);

    // Antrag ohne Verlauf taucht in der View nicht auf
    const ohne = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${String(a!.id)}, true)`;
      const r = await tx<{ id: string }[]>`INSERT INTO antraege (organization_id, first_name, last_name) VALUES (${a!.id}, 'Still', 'Ohne-Verlauf') RETURNING id`;
      return r[0]!.id;
    });
    expect((await sql`SELECT 1 FROM v_rueckfragen_tdd WHERE antrag_id = ${ohne}`).length).toBe(0);
  } finally {
    await sql.end();
  }
});
