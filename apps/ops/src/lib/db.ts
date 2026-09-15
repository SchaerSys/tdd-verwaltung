import { createDb, type Database } from "@tdd/db";

let _db: Database | null = null;

/**
 * DB-Client der Wartungsplattform: Rolle tdd_ops ueber OPS_DATABASE_URL.
 * Die Rolle hat in der Datenbank keinen Lesezugriff auf Personendaten (002/032) –
 * jede Query hier kann deshalb nur Metadaten und Aggregat-Views liefern.
 */
export function db(): Database {
  if (!_db) {
    const url = process.env.OPS_DATABASE_URL;
    if (!url) throw new Error("OPS_DATABASE_URL fehlt");
    _db = createDb(url);
  }
  return _db;
}
