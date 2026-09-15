// Legt ein Konto der Wartungsplattform an oder setzt dessen Passwort neu (argon2id-Hash).
//
// Nutzung:  node scripts/create-ops-admin.mjs <email> ["<Anzeigename>"]
// Das Passwort wird abgefragt und nicht als Argument uebergeben – Argumente landen
// in der Shell-History und in der Prozessliste. Ohne Terminal (z. B. per Pipe):
//   echo "$PW" | node scripts/create-ops-admin.mjs <email>
// Voraussetzung: OPS_DATABASE_URL gesetzt (Rolle tdd_ops), Migration 032 eingespielt.
import { hash } from "@node-rs/argon2";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import postgres from "postgres";

const MIN_LENGTH = 12; // wie MIN_PASSWORD_LENGTH in apps/ops

const [, , email, displayName] = process.argv;
if (!email) {
  console.error('Aufruf: node scripts/create-ops-admin.mjs <email> ["<Anzeigename>"]');
  process.exit(1);
}
const url = process.env.OPS_DATABASE_URL;
if (!url) {
  console.error("OPS_DATABASE_URL fehlt");
  process.exit(1);
}

async function passwortAbfragen() {
  if (!stdin.isTTY) {
    // Pipe (oder ssh ohne -tt): erste Zeile ist das Passwort. Ohne Hinweis sieht
    // man sonst nur einen leeren Bildschirm und wartet.
    console.error("Kein Terminal erkannt – Passwort eingeben und Enter druecken (Eingabe ist dann sichtbar; sonst ssh -tt verwenden):");
    let data = "";
    for await (const chunk of stdin) data += chunk;
    return data.split(/\r?\n/)[0] ?? "";
  }
  const rl = createInterface({ input: stdin, output: stdout });
  // Eingabe nicht anzeigen
  const frage = (text) =>
    new Promise((resolve) => {
      stdout.write(text);
      const alt = rl._writeToOutput;
      rl._writeToOutput = () => {};
      rl.question("", (antwort) => {
        rl._writeToOutput = alt;
        stdout.write("\n");
        resolve(antwort);
      });
    });
  const pw1 = await frage("Neues Passwort: ");
  const pw2 = await frage("Wiederholen:    ");
  rl.close();
  if (pw1 !== pw2) {
    console.error("Die Eingaben stimmen nicht ueberein.");
    process.exit(1);
  }
  return pw1;
}

const password = await passwortAbfragen();
if (password.length < MIN_LENGTH) {
  console.error(`Das Passwort muss mindestens ${MIN_LENGTH} Zeichen haben.`);
  process.exit(1);
}

const sql = postgres(url);
const passwordHash = await hash(password);
await sql`
  INSERT INTO ops_users (email, password_hash, display_name)
  VALUES (${email.toLowerCase()}, ${passwordHash}, ${displayName ?? "Betreiber"})
  ON CONFLICT (email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash, failed_attempts = 0, locked_until = NULL, is_active = true
`;
console.log(`Wartungskonto angelegt/aktualisiert: ${email}`);
await sql.end();
