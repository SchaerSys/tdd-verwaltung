import { describe, expect, test } from "vitest";
import { antragCheck, checkZusammenfassung } from "@/lib/antrag-check";

const voll = {
  firstName: "Anna", lastName: "Muster", email: "anna@example.org", birthDate: "1990-05-05", address: "Weg 1",
  postalCode: "6900", city: "Bregenz", phone: "0664", consent: true, intendedLocationId: 12, einnahmenErfasst: true,
};

describe("Vollstaendigkeits-Checkliste", () => {
  test("vollstaendiger Antrag", () => {
    const z = checkZusammenfassung(antragCheck(voll));
    expect(z.vollstaendig).toBe(true);
    expect(z.pflichtFehlt).toEqual([]);
  });
  test("Pflicht: Name, E-Mail, Einwilligung", () => {
    const z = checkZusammenfassung(antragCheck({ ...voll, lastName: " ", email: "kaputt", consent: false }));
    expect(z.pflichtFehlt.map((p) => p.key)).toEqual(["name", "email", "consent"]);
    expect(z.vollstaendig).toBe(false);
  });
  test("Empfehlungen blockieren nicht", () => {
    const z = checkZusammenfassung(antragCheck({ ...voll, birthDate: "", phone: "", intendedLocationId: "", einnahmenErfasst: false }));
    expect(z.pflichtFehlt).toEqual([]);
    expect(z.empfohlenFehlt.map((p) => p.key)).toEqual(["birth", "phone", "standort", "einnahmen"]);
  });
  test("Adresse nur mit PLZ und Ort komplett", () => {
    const p = antragCheck({ ...voll, postalCode: "" }).find((x) => x.key === "adresse")!;
    expect(p.ok).toBe(false);
  });
  test("Dokumente nur auf der Antragsseite", () => {
    expect(antragCheck(voll).some((p) => p.key.startsWith("doc_"))).toBe(false);
    const mit = antragCheck({ ...voll, dokumente: ["AUSWEIS"] });
    expect(mit.find((p) => p.key === "doc_ausweis")?.ok).toBe(true);
    expect(mit.find((p) => p.key === "doc_einkommen")?.ok).toBe(false);
  });
});
