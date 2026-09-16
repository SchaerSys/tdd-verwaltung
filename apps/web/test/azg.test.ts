import { describe, expect, test } from "vitest";
import { feiertage, feiertagsKarte, ostersonntag } from "@/lib/feiertage";
import { monatAuswertung, sollJeWochentag, type Verteilung } from "@/lib/azg";
import { viennaLocalToUtc, type Ev } from "@/lib/zeit";

const ev = (kind: Ev["kind"], local: string): Ev => ({ kind, at: viennaLocalToUtc(local) });
const tag = (d: string, von: string, bis: string, pause?: [string, string]): Ev[] => [
  ev("IN", `${d}T${von}`), ...(pause ? [ev("BREAK_START", `${d}T${pause[0]}`), ev("BREAK_END", `${d}T${pause[1]}`)] : []), ev("OUT", `${d}T${bis}`),
];
const NOW = new Date("2026-10-05T12:00:00Z");

describe("Feiertage", () => {
  test("Ostern und bewegliche Feste", () => {
    expect(ostersonntag(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(ostersonntag(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
    const f = feiertage(2026);
    expect(f.find((x) => x.name === "Ostermontag")?.datum).toBe("2026-04-06");
    expect(f.find((x) => x.name === "Fronleichnam")?.datum).toBe("2026-06-04");
    expect(f.length).toBe(13);
    expect(feiertagsKarte([2026]).get("2026-10-26")).toBe("Nationalfeiertag");
  });
});

describe("Soll aus Wochenverteilung", () => {
  test("Verteilung schlaegt Wochenstunden; ohne Verteilung Mo–Fr", () => {
    const v: Verteilung = { "1": 480, "2": 480, "4": 240 };
    expect(sollJeWochentag(v, 38.5)).toEqual({ 1: 480, 2: 480, 3: 0, 4: 240, 5: 0, 6: 0, 7: 0 });
    expect(sollJeWochentag(null, 20)[3]).toBe(240);
    expect(sollJeWochentag(null, null)[1]).toBe(0);
  });
});

describe("Monatsauswertung nach AZG", () => {
  const verteilung: Verteilung = { "1": 480, "2": 480, "3": 480, "4": 480, "5": 480 }; // 40 h
  const feier = feiertagsKarte([2026]);

  test("Feiertag und Urlaub sind Gutschrift, Saldo stimmt", () => {
    // Sept 2026: 22 Werktage, kein Feiertag; Urlaub 7.–11.9. (5 Tage)
    const events = [...tag("2026-09-01", "08:00", "16:30", ["12:00", "12:30"])];
    const a = monatAuswertung({ events, verteilung, wochenstunden: 40, jahr: 2026, monat: 9, feiertage: feier, abwesenheiten: [{ art: "URLAUB", von: "2026-09-07", bis: "2026-09-11" }], now: NOW });
    expect(a.sollMin).toBe(22 * 480);
    expect(a.gutschriftMin).toBe(5 * 480);
    expect(a.abwesenheitstage).toBe(5);
    expect(a.istMin).toBe(480);
    expect(a.saldoMin).toBe(480 + 5 * 480 - 22 * 480);
    // Oktober 2026: Nationalfeiertag am Montag 26.10. -> Gutschrift, aber nur bis "heute" (5.10.) faellig
    const o = monatAuswertung({ events: [], verteilung, wochenstunden: 40, jahr: 2026, monat: 10, feiertage: feier, abwesenheiten: [], now: new Date("2026-10-31T12:00:00Z") });
    expect(o.feiertage).toBe(1);
    expect(o.tage.find((t) => t.datum === "2026-10-26")?.gutschriftGrund).toBe("Nationalfeiertag");
  });

  test("Pruefungen: Pause, Tagesmaximum, Ruhezeit, Sonntag, offener Tag", () => {
    const events = [
      ...tag("2026-09-01", "07:00", "18:30"),                       // 11,5 h ohne Pause
      ...tag("2026-09-02", "04:00", "12:00", ["08:00", "08:30"]),   // nur 9,5 h Ruhe seit 18:30
      ...tag("2026-09-06", "09:00", "11:00"),                       // Sonntag
      ev("IN", "2026-09-03T08:00"),                                  // Ausstempeln vergessen
    ];
    const a = monatAuswertung({ events, verteilung, wochenstunden: 40, jahr: 2026, monat: 9, feiertage: feier, abwesenheiten: [], now: NOW });
    const codes = a.warnungen.map((w) => `${w.datum}:${w.code}`);
    expect(codes).toContain("2026-09-01:TAG_MAX");
    expect(codes).toContain("2026-09-01:PAUSE");
    expect(codes).toContain("2026-09-02:RUHEZEIT");
    expect(codes).toContain("2026-09-06:SONNTAG");
    expect(codes).toContain("2026-09-03:OFFEN");
    expect(a.warnungen.some((w) => w.code === "TAG_12H")).toBe(false);
  });

  test("Mehrarbeit bei Teilzeit, Ueberstunden ueber 40 h", () => {
    const teilzeit: Verteilung = { "1": 300, "2": 300, "3": 300, "4": 300 }; // 20 h
    // KW 37 (7.–13.9.): Mo–Fr je 8 h = 40 h, Sa 4 h = 44 h
    const events = ["07", "08", "09", "10", "11"].flatMap((d) => tag(`2026-09-${d}`, "08:00", "16:30", ["12:00", "12:30"])).concat(tag("2026-09-12", "08:00", "12:00"));
    const a = monatAuswertung({ events, verteilung: teilzeit, wochenstunden: 20, jahr: 2026, monat: 9, feiertage: feier, abwesenheiten: [], now: NOW });
    const w = a.wochen.find((x) => x.kw === "2026-W37")!;
    expect(w.istMin).toBe(44 * 60);
    expect(w.mehrarbeitMin).toBe(20 * 60);   // 20 -> 40 h
    expect(w.ueberstundenMin).toBe(4 * 60);  // ueber 40 h
    const voll = monatAuswertung({ events, verteilung, wochenstunden: 40, jahr: 2026, monat: 9, feiertage: feier, abwesenheiten: [], now: NOW });
    expect(voll.wochen.find((x) => x.kw === "2026-W37")!.mehrarbeitMin).toBe(0);
    expect(voll.ueberstundenMin).toBe(240);
  });
});
