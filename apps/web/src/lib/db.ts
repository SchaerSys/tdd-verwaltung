import { createDb, type Database } from "@tdd/db";

let _db: Database | null = null;

/** Singleton-DB-Client für die Fach-App (Rolle tdd_app via DATABASE_URL). */
export function db(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL fehlt");
    _db = createDb(url);
  }
  return _db;
}
