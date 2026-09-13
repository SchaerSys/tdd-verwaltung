import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const SQL_DIR = join(process.cwd(), "..", "..", "packages", "db", "sql");
const HOST = process.env.TEST_PG_HOST ?? "127.0.0.1:5432";
const DBNAME = process.env.TEST_PG_DB ?? "tdd_test";

export const adminUrl = () => `postgresql://tdd_owner:test@${HOST}/${DBNAME}`;
export const appUrl = () => `postgresql://tdd_app:test@${HOST}/${DBNAME}`;
export const opsUrl = () => `postgresql://tdd_ops:test@${HOST}/${DBNAME}`;

let angewendet = false;

/** Spielt alle SQL-Migrationen der Reihe nach ein und setzt die Rollen-Passwoerter. Einmal je Lauf. */
export async function applyMigrations(): Promise<void> {
  if (angewendet) return;
  // vitest laedt jede Testdatei isoliert, deshalb laufen die (idempotenten)
  // Migrationen je Datei einmal – die "already exists"-Hinweise sind erwartet.
  const admin = postgres(adminUrl(), { max: 1, onnotice: () => {} });
  try {
    const files = readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      await admin.unsafe(readFileSync(join(SQL_DIR, file), "utf8"));
    }
    await admin.unsafe("ALTER ROLE tdd_app PASSWORD 'test'; ALTER ROLE tdd_ops PASSWORD 'test';");
    angewendet = true;
  } finally {
    await admin.end();
  }
}
