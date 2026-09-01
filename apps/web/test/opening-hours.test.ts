import { describe, it, expect } from "vitest";
import { asOpeningHours, isOpenNow, todayText, hasAnyHours, WEEKDAYS, type OpeningHours } from "@/lib/opening-hours";

const allDays = (from: string, to: string): OpeningHours =>
  Object.fromEntries(WEEKDAYS.map((d) => [d, [{ from, to }]]));

describe("asOpeningHours", () => {
  it("null/Unsinn → leeres Objekt", () => {
    expect(asOpeningHours(null)).toEqual({});
    expect(asOpeningHours(42)).toEqual({});
  });
  it("übernimmt gültige Slots, verwirft unvollständige", () => {
    const oh = asOpeningHours({ mon: [{ from: "09:00", to: "12:00" }], tue: [{ from: "09:00" }], junk: 1 });
    expect(oh.mon).toEqual([{ from: "09:00", to: "12:00" }]);
    expect(oh.tue).toEqual([]); // ungültiger Slot verworfen → leeres Fenster (gilt als geschlossen)
    expect(hasAnyHours(oh)).toBe(true); // wegen mon
  });
});

describe("hasAnyHours", () => {
  it("erkennt vorhandene/fehlende Zeiten", () => {
    expect(hasAnyHours(null)).toBe(false);
    expect(hasAnyHours({})).toBe(false);
    expect(hasAnyHours({ mon: [] })).toBe(false);
    expect(hasAnyHours({ mon: [{ from: "09:00", to: "12:00" }] })).toBe(true);
  });
});

describe("isOpenNow (Europe/Vienna)", () => {
  const oh = allDays("09:00", "17:00");
  it("innerhalb des Fensters → offen", () => {
    // 2026-08-25 08:00 UTC = 10:00 Wiener Sommerzeit
    expect(isOpenNow(oh, new Date("2026-08-25T08:00:00Z"))).toBe(true);
  });
  it("außerhalb des Fensters → geschlossen", () => {
    // 2026-08-25 16:00 UTC = 18:00 Wiener Zeit
    expect(isOpenNow(oh, new Date("2026-08-25T16:00:00Z"))).toBe(false);
  });
  it("berücksichtigt den Wochentag", () => {
    const tueOnly: OpeningHours = { tue: [{ from: "09:00", to: "17:00" }] };
    // 2026-09-01 ist ein Dienstag; 09:00 UTC = 11:00 Wien
    expect(isOpenNow(tueOnly, new Date("2026-09-01T09:00:00Z"))).toBe(true);
    // 2026-09-06 ist ein Sonntag → kein Slot
    expect(isOpenNow(tueOnly, new Date("2026-09-06T09:00:00Z"))).toBe(false);
  });
  it("ohne Öffnungszeiten → geschlossen", () => {
    expect(isOpenNow(null)).toBe(false);
    expect(isOpenNow({})).toBe(false);
  });
});

describe("todayText", () => {
  it("zeigt das heutige Fenster bzw. 'geschlossen'", () => {
    expect(todayText(allDays("09:00", "12:00"), new Date("2026-08-25T08:00:00Z"))).toBe("09:00–12:00");
    expect(todayText({ tue: [] }, new Date("2026-09-01T09:00:00Z"))).toBe("geschlossen");
    expect(todayText(null)).toBe("geschlossen");
  });
});
