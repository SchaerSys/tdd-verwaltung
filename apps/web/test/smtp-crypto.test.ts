import { describe, it, expect, beforeAll } from "vitest";
import { smtpPasswortVerschluesseln, smtpPasswortEntschluesseln, empfaengerFuerProtokoll } from "@tdd/db";

describe("SMTP-Passwort verschluesselt (057)", () => {
  beforeAll(() => { process.env.SMTP_KEY = "test-schluessel-mit-genug-laenge"; });
  it("rundet um, ist je Aufruf anders (IV) und erkennt Manipulation", () => {
    const a = smtpPasswortVerschluesseln("Geheim!ß€");
    const b = smtpPasswortVerschluesseln("Geheim!ß€");
    expect(a).not.toBe(b);
    expect(smtpPasswortEntschluesseln(a)).toBe("Geheim!ß€");
    const kaputt = Buffer.from(a, "base64"); kaputt[kaputt.length - 1] ^= 0xff;
    expect(() => smtpPasswortEntschluesseln(kaputt.toString("base64"))).toThrow();
    process.env.SMTP_KEY = "anderer-schluessel-mit-genug-laenge";
    expect(() => smtpPasswortEntschluesseln(a)).toThrow();
    process.env.SMTP_KEY = "test-schluessel-mit-genug-laenge";
  });
  it("Protokoll kennt nur Hash und Domain", () => {
    const p = empfaengerFuerProtokoll(" Max.Muster@Example.ORG ");
    expect(p.domain).toBe("example.org"); expect(p.hash).toHaveLength(64); expect(p.hash).not.toContain("max");
  });
});
