import { describe, it, expect } from "vitest";
import { fmtDate, fmtDateTime } from "@/lib/format";

describe("fmtDate", () => {
  it("reines Datum (YYYY-MM-DD) → TT.MM.JJJJ ohne Zeitzonen-Verschiebung", () => {
    expect(fmtDate("2026-08-25")).toBe("25.08.2026");
    expect(fmtDate("2026-01-01")).toBe("01.01.2026");
  });
  it("ISO mit Uhrzeit wird auf den Datumsteil reduziert (kein Off-by-one)", () => {
    expect(fmtDate("2026-08-25T23:30:00Z")).toBe("25.08.2026");
  });
  it("Date-Objekt", () => {
    expect(fmtDate(new Date(2026, 7, 5))).toBe("05.08.2026"); // Monat 7 = August
  });
  it("leer/ungültig → —", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
    expect(fmtDate("")).toBe("—");
    expect(fmtDate("kein-datum")).toBe("—");
  });
});

describe("fmtDateTime (Europe/Vienna)", () => {
  it("Winter (UTC+1)", () => {
    expect(fmtDateTime("2026-01-15T10:30:00Z")).toBe("15.01.2026 11:30");
  });
  it("Sommer (UTC+2)", () => {
    expect(fmtDateTime("2026-07-15T10:30:00Z")).toBe("15.07.2026 12:30");
  });
  it("leer/ungültig → —", () => {
    expect(fmtDateTime(null)).toBe("—");
    expect(fmtDateTime("nope")).toBe("—");
  });
});
