/**
 * Anspruchsprüfung (Entscheidungshilfe) gemäß TDD-Richtlinien (Formular Seite 3).
 * Einkommensgrenze: €870 Haushaltsvorstand + €415 je weitere volljährige Person
 * + €195 je Kind. 10 % Toleranz = Härtefall-Bereich. Der Mensch entscheidet final.
 */

export const INCOME_FIELDS = [
  ["gehalt", "Gehalt/Lohn"], ["pension", "Pension/Invalidenrente"], ["ams", "AMS-Bezüge"],
  ["krankengeld", "Krankengeld"], ["kbg", "Kinderbetreuungsgeld"], ["wohnbeihilfe", "Wohnbeihilfe"],
  ["alimente", "Alimente"], ["mindestsicherung", "Mindestsicherung"], ["unterhalt", "Unterhaltszahlungen"],
  ["sonstige", "Diverse andere Einkommen"],
] as const;

export const EXPENSE_FIELDS = [
  ["miete", "Miete"], ["betriebskosten", "Betriebs-/Heizkosten"], ["strom", "Stromkosten"],
  ["kinderbetreuung", "Kinderbetreuung/Kindergarten"], ["pflege", "Pflegeaufwand"],
  ["unterhalt", "Unterhaltszahlungen (Inland)"], ["pfaendung", "Lohn-/Gehaltspfändung"],
  ["versicherung", "Haushalts-/Gebäudeversicherung"], ["medikamente", "Medikamente (Langzeitkranke)"],
  ["sonstige", "Sonstiges"],
] as const;

export interface Financials {
  income: Record<string, number>;
  expense: Record<string, number>;
}

export function sumValues(o: Record<string, number> | undefined): number {
  if (!o) return 0;
  return Object.values(o).reduce((s, v) => s + (Number(v) || 0), 0);
}

/** Einkommensgrenze nach Haushaltszusammensetzung. */
export function incomeLimit(adults: number, childrenU12: number, childrenO12: number): number {
  const additionalAdults = Math.max(0, (adults || 1) - 1);
  const children = (childrenU12 || 0) + (childrenO12 || 0);
  return 870 + 415 * additionalAdults + 195 * children;
}

export type Suggestion = "BERECHTIGT" | "HAERTEFALL" | "NICHT_BERECHTIGT";

/** Vorschlag: berechtigt, wenn verfügbares Einkommen ≤ Grenze (+10 % = Härtefall). */
export function suggest(availableIncome: number, limit: number): Suggestion {
  if (availableIncome <= limit) return "BERECHTIGT";
  if (availableIncome <= limit * 1.1) return "HAERTEFALL";
  return "NICHT_BERECHTIGT";
}

export function suggestionLabel(s: Suggestion): string {
  return s === "BERECHTIGT" ? "Vorschlag: berechtigt"
    : s === "HAERTEFALL" ? "Vorschlag: Härtefall (innerhalb 10 %)"
    : "Vorschlag: nicht berechtigt";
}
