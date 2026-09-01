/**
 * Rollenbasierte Rechte – serverseitig erzwungen.
 * „Kasse (AUSGABE) sieht keine Personenlisten" ist hier abgebildet.
 */
export type Role = "ADMIN" | "ERFASSUNG" | "AUSGABE" | "AUSWERTUNG" | "SACHBEARBEITER";

export type Permission =
  | "person:read"       // Personendaten/Listen einsehen
  | "person:write"      // Personen anlegen/bearbeiten
  | "card:manage"       // Karten ausstellen/verlängern/sperren
  | "distribution:record" // Ausgabe am Tresen erfassen
  | "report:view"       // Auswertungen ansehen/exportieren
  | "admin:manage"      // Benutzer/Standorte/Konfiguration
  | "antrag:manage"     // Anträge erfassen/prüfen/entscheiden (Portal)
  | "document:view"     // Dokumente/Scans einsehen (nur Admin + Sachbearbeiter eigener Org)
  | "staff:manage";     // A2 Personal-Verzeichnis / Zeiterfassung (Zentralsystem)

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: ["person:read", "person:write", "card:manage", "distribution:record", "report:view", "admin:manage", "antrag:manage", "document:view", "staff:manage"],
  ERFASSUNG: ["person:read", "person:write", "card:manage", "distribution:record"], // KEINE Dokumente
  AUSGABE: ["distribution:record"], // nur Scan + Ausgabe, KEINE Personenlisten/Dokumente
  AUSWERTUNG: ["report:view"],
  SACHBEARBEITER: ["antrag:manage", "document:view"], // Portal Gemeinde/Institution; Org-Scope via RLS
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}
