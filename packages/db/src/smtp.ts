import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "./client";

/**
 * SMTP je Mandant (057). Das Passwort liegt in der Datenbank nur verschluesselt
 * (AES-256-GCM); der Schluessel kommt aus der Umgebung SMTP_KEY (beliebiger langer
 * Text, wird per SHA-256 auf 32 Byte gebracht) und liegt nur auf dem Server – ein
 * Datenbank-Backup allein verraet keine Zugangsdaten.
 */
export interface SmtpKonfig {
  host: string; port: number; sicherheit: "STARTTLS" | "SSL" | "KEINE";
  benutzer: string | null; passwort: string | null;
  absenderEmail: string; absenderName: string | null; antwortAn: string | null;
  /** Aenderungszeit – Schluessel fuer den Transport-Cache. */
  stand: string;
}

function schluessel(): Buffer {
  const k = process.env.SMTP_KEY;
  if (!k || k.length < 16) throw new Error("SMTP_KEY fehlt oder ist zu kurz (mind. 16 Zeichen)");
  return createHash("sha256").update(k).digest();
}

/** Klartext → base64(iv | tag | ciphertext). */
export function smtpPasswortVerschluesseln(klartext: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", schluessel(), iv);
  const enc = Buffer.concat([c.update(klartext, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

export function smtpPasswortEntschluesseln(enc: string): string {
  const b = Buffer.from(enc, "base64");
  const iv = b.subarray(0, 12), tag = b.subarray(12, 28), data = b.subarray(28);
  const d = createDecipheriv("aes-256-gcm", schluessel(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

/** Konfiguration des Mandanten (aktueller Kontext oder explizit) ueber die Owner-Funktion; null = nicht hinterlegt. */
export async function smtpKonfigLaden(db: Database, tenantId?: string): Promise<SmtpKonfig | null> {
  const res = await db.execute(tenantId ? sql`SELECT * FROM smtp_fuer_mandant(${tenantId}::uuid)` : sql`SELECT * FROM smtp_fuer_mandant()`);
  const r = (res as unknown as {
    host: string; port: number; sicherheit: string; benutzer: string | null; passwort_enc: string | null;
    absender_email: string; absender_name: string | null; antwort_an: string | null; aktualisiert_am: Date | string;
  }[])[0];
  if (!r) return null;
  let passwort: string | null = null;
  if (r.passwort_enc) {
    try { passwort = smtpPasswortEntschluesseln(r.passwort_enc); }
    catch { throw new Error("SMTP-Passwort kann nicht entschluesselt werden (SMTP_KEY geaendert?)"); }
  }
  return {
    host: r.host, port: Number(r.port), sicherheit: (r.sicherheit as SmtpKonfig["sicherheit"]) ?? "STARTTLS",
    benutzer: r.benutzer, passwort, absenderEmail: r.absender_email, absenderName: r.absender_name, antwortAn: r.antwort_an,
    stand: String(r.aktualisiert_am),
  };
}

/** Plattform-SMTP aus der Umgebung (Rueckfall, Betreiber-Mails). */
export function smtpKonfigAusUmgebung(): SmtpKonfig | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host, port, sicherheit: port === 465 ? "SSL" : "STARTTLS",
    benutzer: process.env.SMTP_USER ?? null, passwort: process.env.SMTP_PASS ?? null,
    absenderEmail: process.env.SMTP_FROM ?? "noreply@careos.local", absenderName: "CareOS", antwortAn: null, stand: "env",
  };
}

/** Empfaenger fuer das Protokoll: Hash + Domain, nie die Adresse. */
export function empfaengerFuerProtokoll(email: string): { hash: string; domain: string | null } {
  const e = email.trim().toLowerCase();
  return { hash: createHash("sha256").update(e).digest("hex"), domain: e.includes("@") ? e.split("@")[1]! : null };
}
