import { createDb, type Database } from "@tdd/db";
import { gewaehlterMandant } from "./tenant";

const pools = new Map<string, Database>();

/**
 * DB-Client der Wartungsplattform: Rolle tdd_ops ueber OPS_DATABASE_URL.
 * Die Rolle hat in der Datenbank keinen Lesezugriff auf Personendaten (002/032) –
 * jede Query hier kann deshalb nur Metadaten und Aggregat-Views liefern.
 * Je gewaehltem Mandanten ein Pool mit GUC (053): mit Mandant nur dessen Zeilen,
 * Schluessel "" = ohne Kontext = alle Mandanten.
 */
export async function db(): Promise<Database> {
  const tenant = (await gewaehlterMandant()) ?? "";
  let d = pools.get(tenant);
  if (!d) {
    const url = process.env.OPS_DATABASE_URL;
    if (!url) throw new Error("OPS_DATABASE_URL fehlt");
    d = createDb(url, tenant || undefined, 5);
    pools.set(tenant, d);
  }
  return d;
}
