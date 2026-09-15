import { beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import { applyMigrations, appUrl, opsUrl } from "./db";

beforeAll(applyMigrations);

/** 032: Wartungsplattform – Einladung ohne Hash-Zugriff, Protokoll ohne Personenbezug, eigene Konten. */
test("Wartungsrolle: Einladen per Funktion, Log nur aggregiert, ops_users nur fuer tdd_ops", async () => {
  const ops = postgres(opsUrl(), { max: 1 });
  const app = postgres(appUrl(), { max: 1 });
  try {
    const email = `ops-test-${Date.now()}@example.org`;
    const loc = await ops<{ id: number }[]>`SELECT id FROM locations ORDER BY id LIMIT 1`;

    // Einladung: Konto entsteht mit unbrauchbarem Hash und einem RESET-Token (nur der Rohwert kommt zurueck).
    const r = await ops<{ t: string }[]>`SELECT ops_invite_user(${email}, 'Ops Test', 'ERFASSUNG', ${loc[0]?.id ?? null}, NULL) AS t`;
    expect(r[0]!.t).toMatch(/^[0-9a-f]{64}$/);
    const u = await ops<{ id: string; role: string; is_active: boolean }[]>`SELECT id, role, is_active FROM users WHERE email = ${email}`;
    expect(u[0]?.role).toBe("ERFASSUNG");
    expect(u[0]?.is_active).toBe(true);
    // Der Hash bleibt fuer tdd_ops unsichtbar; die Fach-App sieht '!' (kein argon2-Hash -> Login unmoeglich).
    await expect(ops`SELECT password_hash FROM users WHERE email = ${email}`).rejects.toThrow(/permission denied/i);
    const h = await app<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE email = ${email}`;
    expect(h[0]?.password_hash).toBe("!");
    const tok = await app<{ type: string; used_at: Date | null }[]>`SELECT type, used_at FROM auth_tokens WHERE user_id = ${u[0]!.id}`;
    expect(tok.length).toBe(1);
    expect(tok[0]?.type).toBe("RESET");

    // Ungueltige Rolle wird abgewiesen, doppelte E-Mail auch.
    await expect(ops`SELECT ops_invite_user('x@example.org', 'X', 'ROOT', NULL, NULL)`).rejects.toThrow(/Unbekannte Rolle/);
    await expect(ops`SELECT ops_invite_user(${email}, 'X', 'ADMIN', NULL, NULL)`).rejects.toThrow();

    // Passwort-Link und 2FA-Reset laufen ueber die Funktionen, nicht ueber Spaltenrechte.
    const r2 = await ops<{ t: string }[]>`SELECT ops_password_reset_token(${u[0]!.id}::uuid) AS t`;
    expect(r2[0]!.t).toMatch(/^[0-9a-f]{64}$/);
    await ops`SELECT ops_reset_totp(${u[0]!.id}::uuid)`;
    await expect(ops`UPDATE users SET password_hash = 'x' WHERE id = ${u[0]!.id}`).rejects.toThrow(/permission denied/i);

    // Protokoll: Views ja, Rohtabelle nein; eigene Eintraege schreiben ja.
    await ops`INSERT INTO audit_logs (action, entity_type, after) VALUES ('ops.test', 'system', '{"ops":"test"}')`;
    await expect(ops`SELECT * FROM audit_logs LIMIT 1`).rejects.toThrow(/permission denied/i);
    const daily = await ops`SELECT * FROM v_audit_daily WHERE action = 'ops.test'`;
    expect(daily.length).toBe(1);
    const recent = await ops<{ action: string }[]>`SELECT action FROM v_audit_recent LIMIT 5`;
    expect(recent.some((x) => x.action === "ops.test")).toBe(true);
    await ops`SELECT * FROM v_login_daily`;

    // ops_users: nur die Wartungsrolle.
    await ops`INSERT INTO ops_users (email, password_hash, display_name) VALUES (${"betreiber-" + email}, '!', 'Betreiber')`;
    await expect(app`SELECT * FROM ops_users LIMIT 1`).rejects.toThrow(/permission denied/i);

    // Die PII-Sperre bleibt.
    await expect(ops`SELECT * FROM persons LIMIT 1`).rejects.toThrow(/permission denied/i);
    await expect(ops`SELECT * FROM antrag_nachrichten LIMIT 1`).rejects.toThrow(/permission denied/i);
  } finally {
    await ops.end();
    await app.end();
  }
});
