// Legt den ersten Admin-Benutzer an (argon2id-Hash).
// Nutzung:  node scripts/create-admin.mjs <email> <passwort> "<Anzeigename>"
// Voraussetzung: DATABASE_URL gesetzt, Schema (001/002/003) eingespielt.
import { hash } from "@node-rs/argon2";
import postgres from "postgres";

const [, , email, password, displayName] = process.argv;
if (!email || !password) {
  console.error('Aufruf: node scripts/create-admin.mjs <email> <passwort> "<Anzeigename>"');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL fehlt");
  process.exit(1);
}

const sql = postgres(url);
const passwordHash = await hash(password);
await sql`
  INSERT INTO users (email, password_hash, display_name, role)
  VALUES (${email.toLowerCase()}, ${passwordHash}, ${displayName ?? "Administrator"}, 'ADMIN')
  ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
`;
console.log(`Admin angelegt/aktualisiert: ${email}`);
await sql.end();
