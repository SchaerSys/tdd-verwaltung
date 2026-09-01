import { describe, it, expect } from "vitest";
import { statusFromLast, allowedActions, dayTotals, azgWarnings, fmtMin, viennaLocalToUtc } from "@/lib/zeit";

describe("statusFromLast / allowedActions", () => {
  it("leitet Status ab", () => {
    expect(statusFromLast(null)).toBe("OUT");
    expect(statusFromLast("IN")).toBe("IN");
    expect(statusFromLast("BREAK_END")).toBe("IN");
    expect(statusFromLast("BREAK_START")).toBe("BREAK");
    expect(statusFromLast("OUT")).toBe("OUT");
  });
  it("erlaubt sinnvolle Folgeaktionen", () => {
    expect(allowedActions("OUT")).toEqual(["IN"]);
    expect(allowedActions("IN")).toEqual(["BREAK_START", "OUT"]);
    expect(allowedActions("BREAK")).toEqual(["BREAK_END"]);
  });
});

describe("dayTotals", () => {
  it("berechnet Netto-Arbeitszeit abzüglich Pause", () => {
    // 08:00 IN, 12:00 Pause, 12:30 Pause Ende, 16:00 OUT → 7:30 Arbeit, 30 Min Pause
    const evs = [
      { kind: "IN" as const, at: "2026-09-01T08:00:00Z" },
      { kind: "BREAK_START" as const, at: "2026-09-01T12:00:00Z" },
      { kind: "BREAK_END" as const, at: "2026-09-01T12:30:00Z" },
      { kind: "OUT" as const, at: "2026-09-01T16:00:00Z" },
    ];
    const t = dayTotals(evs);
    expect(t.workedMin).toBe(450); // 7,5 h
    expect(t.breakMin).toBe(30);
    expect(t.open).toBe(false);
  });
  it("offene Session wird bis 'now' gerechnet", () => {
    const evs = [{ kind: "IN" as const, at: "2026-09-01T08:00:00Z" }];
    const t = dayTotals(evs, new Date("2026-09-01T10:00:00Z"));
    expect(t.workedMin).toBe(120);
    expect(t.open).toBe(true);
  });
});

describe("azgWarnings", () => {
  it("warnt bei zu kurzer Pause über 6 h", () => {
    expect(azgWarnings(7 * 60, 15)).toContain("Pause < 30 Min bei > 6 h Arbeitszeit (§ 11 AZG)");
    expect(azgWarnings(7 * 60, 30)).toHaveLength(0);
  });
  it("warnt über 12 h Tagesarbeitszeit", () => {
    expect(azgWarnings(13 * 60, 60)).toContain("> 12 h Tagesarbeitszeit (§ 9 AZG)");
  });
});

describe("fmtMin", () => {
  it("formatiert Minuten als H:MM h", () => {
    expect(fmtMin(450)).toBe("7:30 h");
    expect(fmtMin(60)).toBe("1:00 h");
    expect(fmtMin(5)).toBe("0:05 h");
  });
});

describe("viennaLocalToUtc", () => {
  it("Sommerzeit (UTC+2): 08:00 Wien → 06:00 UTC", () => {
    expect(viennaLocalToUtc("2026-07-15T08:00").toISOString()).toBe("2026-07-15T06:00:00.000Z");
  });
  it("Winterzeit (UTC+1): 08:00 Wien → 07:00 UTC", () => {
    expect(viennaLocalToUtc("2026-01-15T08:00").toISOString()).toBe("2026-01-15T07:00:00.000Z");
  });
});
