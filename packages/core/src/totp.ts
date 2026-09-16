/**
 * Zeitbasierte Einmalcodes (TOTP, RFC 6238) auf HOTP (RFC 4226), ohne Fremdpaket.
 * Kompatibel mit den gaengigen Authenticator-Apps (SHA-1, 6 Stellen, 30 Sekunden).
 * Reine Funktionen, deshalb gegen die Testvektoren des RFC pruefbar.
 */
import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;
/** Erlaubte Abweichung in Zeitfenstern (±1 = 30 Sekunden Uhrendrift). */
export const TOTP_WINDOW = 1;

/** Base32 (RFC 4648) ohne Padding – das Format, das Authenticator-Apps erwarten. */
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Neues Geheimnis: 20 Zufallsbytes = 160 Bit, wie im RFC empfohlen. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226): HMAC-SHA1 ueber den 8-Byte-Zaehler, dynamische Kuerzung. */
export function hotp(secret: string, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(code % 10 ** digits).padStart(digits, "0");
}

/** TOTP (RFC 6238): HOTP mit dem Zeitfenster als Zaehler. */
export function totp(secret: string, atSeconds = Math.floor(Date.now() / 1000)): string {
  return hotp(secret, Math.floor(atSeconds / TOTP_STEP_SECONDS));
}

/**
 * Prueft einen eingegebenen Code gegen das aktuelle und die Nachbarfenster.
 * Gibt das getroffene Fenster zurueck (fuer Wiederholungsschutz) oder null.
 */
export function verifyTotp(secret: string, code: string, atSeconds = Math.floor(Date.now() / 1000)): number | null {
  const eingabe = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(eingabe)) return null;
  const jetzt = Math.floor(atSeconds / TOTP_STEP_SECONDS);
  for (let d = -TOTP_WINDOW; d <= TOTP_WINDOW; d++) {
    const erwartet = hotp(secret, jetzt + d);
    if (safeEqual(erwartet, eingabe)) return jetzt + d;
  }
  return null;
}

/** Adresse fuer den QR-Code, die alle Authenticator-Apps verstehen. */
export function otpauthUrl(secret: string, account: string, issuer = "CareOS"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

/** Zehn Wiederherstellungscodes, je 10 Zeichen in Zweiergruppen – zum Ausdrucken. */
export function generateRecoveryCodes(anzahl = 10): string[] {
  const zeichen = "abcdefghjkmnpqrstuvwxyz23456789"; // ohne i, l, o, 0, 1 – nicht verwechselbar
  const codes: string[] = [];
  for (let i = 0; i < anzahl; i++) {
    const b = randomBytes(10);
    let c = "";
    for (let j = 0; j < 10; j++) c += zeichen[b[j]! % zeichen.length];
    codes.push(`${c.slice(0, 5)}-${c.slice(5)}`);
  }
  return codes;
}

/** Wiederherstellungscodes werden nur gehasht gespeichert – wie Passwoerter. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
