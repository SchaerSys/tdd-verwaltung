import { hasPermission, type Permission, type Role } from "./rbac";

export type NavGroupTitle = "Backoffice" | "Tresen-Kiosk" | "Zentralsystem" | "Verwaltung";

export interface NavDef {
  href: string;
  label: string;
  perm: Permission | null;
  group: NavGroupTitle;
  /** Untermenue: href des Eltern-Eintrags (haelt die Leiste kurz, z. B. Disposition). */
  parent?: string;
}

/** Zentraler Navigations-Katalog – Quelle für Sidebar UND Dashboard-Favoriten. */
export const NAV: NavDef[] = [
  { href: "/dashboard", label: "Dashboard", perm: null, group: "Backoffice" },
  { href: "/personen", label: "Personen", perm: "person:read", group: "Backoffice" },
  { href: "/personen/papierkorb", label: "Papierkorb (Personen)", perm: "person:write", group: "Backoffice" },
  { href: "/personen/dubletten", label: "Dubletten", perm: "person:write", group: "Backoffice" },
  { href: "/bewilligt", label: "Bewilligte Anträge", perm: "person:write", group: "Backoffice" },
  { href: "/rueckfragen", label: "Rückfragen (Portal)", perm: "person:write", group: "Backoffice" },
  { href: "/karten", label: "Karten", perm: "card:manage", group: "Backoffice" },
  { href: "/karten/papierkorb", label: "Papierkorb (Karten)", perm: "card:manage", group: "Backoffice" },
  { href: "/auswertungen", label: "Auswertungen", perm: "report:view", group: "Backoffice" },
  { href: "/kiosk", label: "Ausgabe-Scan", perm: "distribution:record", group: "Tresen-Kiosk" },
  { href: "/ausgaben", label: "Ausgaben (heute)", perm: "distribution:record", group: "Tresen-Kiosk" },
  { href: "/personal", label: "A2 · Personal", perm: "staff:manage", group: "Zentralsystem" },
  { href: "/zeit", label: "A2 · Zeiterfassung", perm: "staff:manage", group: "Zentralsystem" },
  { href: "/urlaub", label: "A3 · Urlaub", perm: "staff:manage", group: "Zentralsystem" },
  { href: "/touren", label: "A4 · Disposition", perm: "tour:manage", group: "Zentralsystem" },
  { href: "/touren/vorlagen", label: "Wochenplan", perm: "tour:manage", group: "Zentralsystem", parent: "/touren" },
  { href: "/touren/abholstellen", label: "Abholstellen", perm: "tour:manage", group: "Zentralsystem", parent: "/touren" },
  { href: "/touren/fahrzeuge", label: "Fahrzeuge", perm: "tour:manage", group: "Zentralsystem", parent: "/touren" },
  { href: "/touren/fahrer", label: "Fahrer:innen", perm: "tour:manage", group: "Zentralsystem", parent: "/touren" },
  { href: "/touren/angebote", label: "Angebote (Homepage)", perm: "tour:manage", group: "Zentralsystem", parent: "/touren" },
  { href: "/touren/standorte", label: "Standorte (Karte)", perm: "tour:manage", group: "Zentralsystem", parent: "/touren" },
  { href: "/admin", label: "Stammdaten", perm: "admin:manage", group: "Verwaltung" },
  { href: "/admin/benutzer", label: "Benutzerverwaltung", perm: "admin:manage", group: "Verwaltung" },
  { href: "/admin/import", label: "Import", perm: "admin:manage", group: "Verwaltung" },
  { href: "/admin/migration", label: "Übernahme Altsystem", perm: "admin:manage", group: "Verwaltung" },
  { href: "/admin/pilot", label: "Pilot am Tresen", perm: "admin:manage", group: "Verwaltung" },
];

/** Alle Nav-Einträge, die die Rolle sehen darf. */
export function navFor(role: Role): NavDef[] {
  return NAV.filter((n) => n.perm === null || hasPermission(role, n.perm));
}

/** Sichtbare Nav-Einträge nach Gruppen (leere Gruppen entfallen). */
export interface NavEintrag { href: string; label: string; children?: { href: string; label: string }[] }

export function navGroups(role: Role): { title: NavGroupTitle; items: NavEintrag[] }[] {
  const order: NavGroupTitle[] = ["Backoffice", "Tresen-Kiosk", "Zentralsystem", "Verwaltung"];
  const visible = navFor(role);
  return order
    .map((title) => ({
      title,
      items: visible.filter((n) => n.group === title && !n.parent).map((n): NavEintrag => {
        const children = visible.filter((c) => c.parent === n.href).map((c) => ({ href: c.href, label: c.label }));
        return children.length ? { href: n.href, label: n.label, children } : { href: n.href, label: n.label };
      }),
    }))
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
