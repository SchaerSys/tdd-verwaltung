import { describe, expect, test } from "vitest";
import {
  base32Decode, base32Encode, generateRecoveryCodes, generateSecret, hashRecoveryCode, hotp, otpauthUrl, totp, verifyTotp,
} from "@/lib/totp";

// Geheimnis aus RFC 4226 / RFC 6238: "12345678901234567890" (ASCII)
const RFC_SECRET_BYTES = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET = base32Encode(RFC_SECRET_BYTES); // GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ

describe("Base32", () => {
  test("RFC-Geheimnis kodiert wie erwartet und kommt unversehrt zurueck", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC_SECRET).equals(RFC_SECRET_BYTES)).toBe(true);
  });
  test("Kleinschreibung und Leerzeichen sind erlaubt", () => {
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").equals(RFC_SECRET_BYTES)).toBe(true);
  });
  test("zufaelliges Geheimnis: 20 Bytes ergeben 32 Zeichen", () => {
    const s = generateSecret();
    expect(s).toHaveLength(32);
    expect(base32Decode(s)).toHaveLength(20);
  });
});

describe("HOTP (RFC 4226, Anhang D)", () => {
  const erwartet = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  test.each(erwartet.map((c, i) => [i, c]))("Zaehler %i -> %s", (counter, code) => {
    expect(hotp(RFC_SECRET, counter)).toBe(code);
  });
});

describe("TOTP (RFC 6238, Anhang B, SHA-1, auf 6 Stellen gekuerzt)", () => {
  // Die RFC-Tabelle nennt 8-stellige Codes; die letzten 6 Stellen sind der 6-stellige Code.
  test.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("Zeit %i -> %s", (sekunden, code) => {
    expect(totp(RFC_SECRET, sekunden)).toBe(code);
  });
});

describe("verifyTotp", () => {
  test("akzeptiert aktuelles Fenster und je eins davor und danach", () => {
    const t = 1111111111;
    expect(verifyTotp(RFC_SECRET, "050471", t)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t - 30), t)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t + 30), t)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t + 60), t)).toBeNull();
  });
  test("lehnt falsche und unformatierte Eingaben ab", () => {
    expect(verifyTotp(RFC_SECRET, "000000", 1111111111)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "05047", 1111111111)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", 1111111111)).toBeNull();
  });
  test("Leerzeichen in der Eingabe stoeren nicht", () => {
    expect(verifyTotp(RFC_SECRET, "050 471", 1111111111)).not.toBeNull();
  });
});

describe("Wiederherstellungscodes", () => {
  test("zehn Codes, Format xxxxx-xxxxx, keine verwechselbaren Zeichen", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    for (const c of codes) expect(c).toMatch(/^[a-hj-kmnp-z2-9]{5}-[a-hj-kmnp-z2-9]{5}$/);
    expect(new Set(codes).size).toBe(10);
  });
  test("Hash ignoriert Schreibweise und Bindestrich", () => {
    expect(hashRecoveryCode("abcde-fghjk")).toBe(hashRecoveryCode("ABCDE FGHJK"));
    expect(hashRecoveryCode("abcde-fghjk")).not.toBe(hashRecoveryCode("abcde-fghjm"));
  });
});

test("otpauth-Adresse enthaelt Aussteller, Konto und Geheimnis", () => {
  const url = otpauthUrl("ABC234", "dario@example.at");
  expect(url).toMatch(/^otpauth:\/\/totp\/TDD-Verwaltung%3Adario%40example\.at\?secret=ABC234&issuer=TDD-Verwaltung/);
});
