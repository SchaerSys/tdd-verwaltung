import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * DSGVO-Einwilligung digital (063): Unterschrift als PNG-Datei im Upload-Verzeichnis
 * (Referenz in der DB), Bestaetigungslink als Token (DB speichert nur den Hash, 14 Tage).
 */
export const CONSENT_LABEL: Record<string, string> = { PAPIER: "auf Papier", UNTERSCHRIFT: "Unterschrift am Bildschirm", LINK: "per Bestätigungslink" };

export function storageDir(): string { return process.env.STORAGE_DIR ?? "./data/uploads"; }

/** Data-URL (image/png) aus dem Unterschriftenfeld als Datei speichern; liefert die Referenz. */
export async function unterschriftSpeichern(dataUrl: string): Promise<string | null> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  const buf = Buffer.from(m[1]!, "base64");
  if (buf.length < 200 || buf.length > 500_000) return null; // leer oder unplausibel gross
  const ref = `consent/${randomUUID()}.png`;
  await mkdir(join(storageDir(), "consent"), { recursive: true });
  await writeFile(join(storageDir(), ref), buf);
  return ref;
}

export function tokenErzeugen(): { roh: string; hash: string; bis: Date } {
  const roh = randomBytes(24).toString("base64url");
  return { roh, hash: createHash("sha256").update(roh).digest("hex"), bis: new Date(Date.now() + 14 * 864e5) };
}
export function tokenHash(roh: string): string { return createHash("sha256").update(roh).digest("hex"); }
