import { describe, expect, test } from "vitest";
import { detailFiltern, saeubern } from "@/lib/ereignis";

describe("Support-Meldungen ohne Personenbezug", () => {
  test("E-Mail-Adressen und lange Zahlenfolgen werden ersetzt, gekuerzt", () => {
    expect(saeubern("Fehler bei anna.muster@example.org, Karte 2208000012701")).toBe("Fehler bei [mail], Karte [zahl]");
    expect(saeubern("  viel   Leerraum \n hier ")).toBe("viel Leerraum hier");
    expect(saeubern("x".repeat(500))!.length).toBe(300);
    expect(saeubern("")).toBeNull();
    expect(saeubern("PLZ 6900 bleibt")).toBe("PLZ 6900 bleibt"); // vierstellig ist keine Kennung
  });
  test("nur bekannte Detail-Schluessel, Werte gekuerzt", () => {
    const d = detailFiltern({ version: "2026-09-15", online: false, queue: 3, ua: "Mozilla", geheim: "nein", stack: "a\n".repeat(2000), screen: 12 });
    expect(Object.keys(d).sort()).toEqual(["online", "queue", "screen", "stack", "ua", "version"]);
    expect(d.geheim).toBeUndefined();
    expect((d.stack as string).length).toBeLessThanOrEqual(1500);
    expect(detailFiltern(null)).toEqual({});
    expect(detailFiltern("x")).toEqual({});
  });
});
