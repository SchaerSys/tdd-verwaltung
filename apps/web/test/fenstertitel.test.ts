import { describe, it, expect } from "vitest";
import { fensterTitel } from "../src/lib/nav";

describe("Fenstertitel je Modul", () => {
  it("Dashboard bleibt Tafelwerk, Module tragen ihren Namen, Unterseiten den des Moduls", () => {
    expect(fensterTitel("/dashboard")).toBe("Tafelwerk");
    expect(fensterTitel("/personen")).toBe("Personen");
    expect(fensterTitel("/personen/0f3c1a2b-0000-4000-a000-000000000000")).toBe("Personen");
    expect(fensterTitel("/personen/papierkorb")).toBe("Personen · Papierkorb");
    expect(fensterTitel("/personal/zivildienst")).toBe("Personal · Zivildienst");
    expect(fensterTitel("/personal/abc")).toBe("Personal");
    expect(fensterTitel("/zeit")).toBe("Zeiterfassung");
    expect(fensterTitel("/gibt-es-nicht")).toBe("Tafelwerk");
  });
});
