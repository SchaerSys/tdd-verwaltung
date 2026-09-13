import { describe, expect, test } from "vitest";
import { antragSchema, betrag, ganzzahl, parseForm, personSchema, text } from "@/lib/forms";

function fd(werte: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

describe("Bausteine verhalten sich wie die frueheren s()/n()/i()-Helfer", () => {
  test("text: getrimmt, leer wird null, Nicht-String wird null", () => {
    expect(text.parse("  Müller ")).toBe("Müller");
    expect(text.parse("")).toBeNull();
    expect(text.parse("   ")).toBeNull();
    expect(text.parse(null)).toBeNull();
    expect(text.parse(undefined)).toBeNull();
  });

  test("ganzzahl: Nicht-Ziffern raus, leer/ungueltig wird null", () => {
    expect(ganzzahl.parse("12")).toBe(12);
    expect(ganzzahl.parse(" 3 Kinder ")).toBe(3);
    expect(ganzzahl.parse("")).toBeNull();
    expect(ganzzahl.parse("abc")).toBeNull();
    expect(ganzzahl.parse(null)).toBeNull();
  });

  test("betrag: Komma als Dezimaltrenner, ungueltig wird 0", () => {
    expect(betrag.parse("870,50")).toBe(870.5);
    expect(betrag.parse("1200")).toBe(1200);
    expect(betrag.parse("")).toBe(0);
    expect(betrag.parse("x")).toBe(0);
    expect(betrag.parse(null)).toBe(0);
  });
});

describe("parseForm", () => {
  test("Person: Pflichtfelder fehlen -> Fehler mit Feldname", () => {
    const r = parseForm(personSchema, fd({ firstName: "Anna", lastName: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/lastName/);
  });

  test("Person: fehlende optionale Felder werden null, Zahlen geparst", () => {
    const r = parseForm(personSchema, fd({ firstName: " Anna ", lastName: "Berger", adults: "2", childrenCount: "" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.firstName).toBe("Anna");
      expect(r.data.address).toBeNull();
      expect(r.data.adults).toBe(2);
      expect(r.data.childrenCount).toBeNull();
      expect(r.data.locationId).toBeNull();
    }
  });

  test("Antrag: Vorgaben wie frueher (adults 1, Kinder 0), targetType nur LADEN oder AUSGABESTELLE", () => {
    const r = parseForm(antragSchema, fd({ firstName: "A", lastName: "B", targetType: "irgendwas" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.adults).toBe(1);
      expect(r.data.childrenU12).toBe(0);
      expect(r.data.childrenO12).toBe(0);
      expect(r.data.targetType).toBe("AUSGABESTELLE");
      expect(r.data.intendedLocationId).toBeNull();
    }
    const l = parseForm(antragSchema, fd({ firstName: "A", lastName: "B", targetType: "LADEN", intendedLocationId: "7" }));
    if (l.ok) {
      expect(l.data.targetType).toBe("LADEN");
      expect(l.data.intendedLocationId).toBe(7);
    }
  });
});
