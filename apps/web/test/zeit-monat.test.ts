import { describe, expect, test } from "vitest";
import { fmtSaldo, monatsUebersicht, viennaLocalToUtc, viennaParts, type Ev } from "@/lib/zeit";

const ev = (kind: Ev["kind"], lokal: string): Ev => ({ kind, at: viennaLocalToUtc(lokal) });

describe("Monatsuebersicht", () => {
  // September 2026: 22 Werktage (Mo–Fr). Wir stellen "jetzt" ans Monatsende.
  const jetzt = viennaLocalToUtc("2026-09-30T23:00");

  test("ein normaler Arbeitstag: Kommen, Pause, Gehen", () => {
    const events = [
      ev("IN", "2026-09-01T08:00"), ev("BREAK_START", "2026-09-01T12:00"),
      ev("BREAK_END", "2026-09-01T12:30"), ev("OUT", "2026-09-01T16:30"),
    ];
    const m = monatsUebersicht(events, 40, 2026, 9, jetzt);
    const tag = m.tage.find((t) => t.datum === "2026-09-01")!;
    expect(tag.kommen).toBe("08:00");
    expect(tag.gehen).toBe("16:30");
    expect(tag.workedMin).toBe(8 * 60);
    expect(tag.breakMin).toBe(30);
    expect(tag.sollMin).toBe(8 * 60);
    expect(tag.arbeitstag).toBe(true);
  });

  test("Soll nur fuer Werktage bis heute, Wochenende null", () => {
    const m = monatsUebersicht([], 40, 2026, 9, jetzt);
    expect(m.arbeitstage).toBe(22);
    expect(m.sollMin).toBe(22 * 8 * 60);
    expect(m.tage.find((t) => t.datum === "2026-09-05")!.sollMin).toBe(0); // Samstag
    expect(m.tage.find((t) => t.datum === "2026-09-06")!.arbeitstag).toBe(false); // Sonntag
  });

  test("kuenftige Tage sind noch nicht faellig", () => {
    const mitte = viennaLocalToUtc("2026-09-15T12:00");
    const m = monatsUebersicht([], 40, 2026, 9, mitte);
    expect(m.arbeitstage).toBe(11); // 1.–15.9.: Mo–Fr = 11 Tage
    expect(m.tage.find((t) => t.datum === "2026-09-16")!.sollMin).toBe(0);
  });

  test("Saldo: Teilzeit 20 h, drei volle Tage gearbeitet", () => {
    const events = [
      ev("IN", "2026-09-01T08:00"), ev("OUT", "2026-09-01T12:00"),
      ev("IN", "2026-09-02T08:00"), ev("OUT", "2026-09-02T12:00"),
      ev("IN", "2026-09-03T08:00"), ev("OUT", "2026-09-03T12:00"),
    ];
    const m = monatsUebersicht(events, 20, 2026, 9, jetzt);
    expect(m.istMin).toBe(12 * 60);
    expect(m.sollMin).toBe(22 * 4 * 60);
    expect(m.saldoMin).toBe(12 * 60 - 22 * 4 * 60);
    expect(m.gebuchteTage).toBe(3);
    expect(fmtSaldo(m.saldoMin)).toBe("−76:00 h");
  });

  test("vergessenes Ausstempeln an einem vergangenen Tag wird als offen markiert", () => {
    const events = [ev("IN", "2026-09-01T08:00")]; // kein OUT
    const m = monatsUebersicht(events, 40, 2026, 9, jetzt);
    const tag = m.tage.find((t) => t.datum === "2026-09-01")!;
    expect(tag.offen).toBe(true);
    expect(tag.gehen).toBeNull();
    // ohne OUT endet der Tag mit dem letzten Ereignis: 0 Minuten, nicht 30 Tage
    expect(tag.workedMin).toBe(0);
  });

  test("Tagesgrenze ist die Wiener Wanduhr, auch in der Sommerzeit", () => {
    const events = [ev("IN", "2026-09-01T00:10"), ev("OUT", "2026-09-01T02:10")];
    const m = monatsUebersicht(events, 40, 2026, 9, jetzt);
    expect(m.tage.find((t) => t.datum === "2026-09-01")!.workedMin).toBe(120);
    expect(m.tage.find((t) => t.datum === "2026-08-31")).toBeUndefined();
  });

  test("ohne Wochenstunden kein Soll", () => {
    const m = monatsUebersicht([], null, 2026, 9, jetzt);
    expect(m.sollMin).toBe(0);
  });
});

test("viennaParts liefert Datum, Uhrzeit und Wochentag der Wiener Zeit", () => {
  const p = viennaParts(viennaLocalToUtc("2026-09-01T08:05"));
  expect(p).toEqual({ datum: "2026-09-01", zeit: "08:05", wochentag: 2 });
});
