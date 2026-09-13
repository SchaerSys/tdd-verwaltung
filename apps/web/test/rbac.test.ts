import { describe, expect, test } from "vitest";
import { hasPermission, permissionsFor, type Role } from "@/lib/rbac";

describe("Rechtematrix", () => {
  test("Kasse sieht keine Personenlisten und keine Dokumente", () => {
    expect(hasPermission("AUSGABE", "person:read")).toBe(false);
    expect(hasPermission("AUSGABE", "document:view")).toBe(false);
    expect(hasPermission("AUSGABE", "distribution:record")).toBe(true);
  });

  test("Erfassung darf keine Dokumente sehen", () => {
    expect(hasPermission("ERFASSUNG", "document:view")).toBe(false);
  });

  test("Sachbearbeiter bleibt im Portal", () => {
    expect(permissionsFor("SACHBEARBEITER")).toEqual(["antrag:manage", "document:view"]);
    expect(hasPermission("SACHBEARBEITER", "person:read")).toBe(false);
  });

  test("nur ADMIN darf verwalten", () => {
    const roles: Role[] = ["ERFASSUNG", "AUSGABE", "AUSWERTUNG", "SACHBEARBEITER"];
    for (const r of roles) expect(hasPermission(r, "admin:manage")).toBe(false);
    expect(hasPermission("ADMIN", "admin:manage")).toBe(true);
  });
});
