import { hasPermission, type Permission, type Role } from "./rbac";

export type NavGroupTitle = "Backoffice" | "Tresen-Kiosk" | "Zentralsystem" | "Verwaltung";

export interface NavDef {
  href: string;
  label: string;
  perm: Permission | null;
  group: NavGroupTitle;
}

/** Zentraler Navigations-Katalog – Quelle für Sidebar UND Dashboard-Favoriten. */
export const NAV: NavDef[] = [
  { href: "/dashboard", label: "Dashboard", perm: null, group: "Backoffice" },
  { href: "/personen", label: "Personen", perm: "person:read", group: "Backoffice" },
  { href: "/personen/papierkorb", label: "Papierkorb (Personen)", perm: "person:write", group: "Backoffice" },
  { href: "/personen/dubletten", label: "Dubletten", perm: "person:write", group: "Backoffice" },
  { href: "/bewilligt", label: "Bewilligte Anträge", perm: "person:write", group: "Backoffice" },
  { href: "/karten", label: "Karten", perm: "card:manage", group: "Backoffice" },
  { href: "/karten/papierkorb", label: "Papierkorb (Karten)", perm: "card:manage", group: "Backoffice" },
  { href: "/auswertungen", label: "Auswertungen", perm: "report:view", group: "Backoffice" },
  { href: "/kiosk", label: "Ausgabe-Scan", perm: "distribution:record", group: "Tresen-Kiosk" },
  { href: "/ausgaben", label: "Ausgaben (heute)", perm: "distribution:record", group: "Tresen-Kiosk" },
  { href: "/personal", label: "A2 · Personal", perm: "staff:manage", group: "Zentralsystem" },
  { href: "/admin", label: "Stammdaten", perm: "admin:manage", group: "Verwaltung" },
  { href: "/admin/benutzer", label: "Benutzerverwaltung", perm: "admin:manage", group: "Verwaltung" },
  { href: "/admin/import", label: "Import", perm: "admin:manage", group: "Verwaltung" },
  { href: "/admin/migration", label: "Übernahme Altsystem", perm: "admin:manage", group: "Verwaltung" },
];

/** Alle Nav-Einträge, die die Rolle sehen darf. */
export function navFor(role: Role): NavDef[] {
  return NAV.filter((n) => n.perm === null || hasPermission(role, n.perm));
}

/** Sichtbare Nav-Einträge nach Gruppen (leere Gruppen entfallen). */
export function navGroups(role: Role): { title: NavGroupTitle; items: { href: string; label: string }[] }[] {
  const order: NavGroupTitle[] = ["Backoffice", "Tresen-Kiosk", "Zentralsystem", "Verwaltung"];
  const visible = navFor(role);
  return order
    .map((title) => ({ title, items: visible.filter((n) => n.group === title).map((n) => ({ href: n.href, label: n.label })) }))
    .filter((g) => g.items.length > 0);
}

/** Label zu einem Pfad (für Favoriten-Kacheln). */
export function navLabel(href: string): string {
  return NAV.find((n) => n.href === href)?.label ?? href;
}

/** Als Favorit hinzufügbar? (Dashboard selbst ausgenommen.) */
export function isFavoritable(href: string): boolean {
  return href !== "/dashboard" && NAV.some((n) => n.href === href);
}
