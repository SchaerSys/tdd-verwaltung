import { hasPermission, type Permission, type Role } from "./rbac";

export type NavGroupTitle = "Start" | "Klient:innen" | "Ausgabe" | "Personal" | "Logistik" | "Verwaltung";

export interface NavDef {
  href: string;
  label: string;
  perm: Permission | null;
  group: NavGroupTitle;
  /** Untermenue: href des Eltern-Eintrags (haelt die Leiste kurz). */
  parent?: string;
  /** Modul (057): vom Betreiber je Mandant abschaltbar; ohne Angabe immer sichtbar. */
  modul?: Modul;
}

/** Abschaltbare Module je Mandant (tenants.module, {"portal": false} = aus). */
export type Modul = "portal" | "personal" | "touren" | "station" | "zivildienst";
export const MODULE: { key: Modul; label: string; hinweis: string }[] = [
  { key: "portal", label: "Portal Gemeinden/Institutionen", hinweis: "Anträge, Rückfragen, Bescheide" },
  { key: "personal", label: "Personal & Arbeitszeit", hinweis: "Personalakte, Zeiterfassung, Dienstplan, Abwesenheiten, Lohnexport" },
  { key: "zivildienst", label: "Zivildienst", hinweis: "ZDG-Regeln, Meldungen (setzt Personal voraus)" },
  { key: "touren", label: "Touren & Logistik", hinweis: "Disposition, Fahrzeug-Tablet, Geofencing" },
  { key: "station", label: "Ausgabestation", hinweis: "Wandernder Laptop mit PIN-Anmeldung" },
];
export function modulAktiv(module: Record<string, boolean> | null | undefined, m: Modul): boolean {
  return module?.[m] !== false;
}

/**
 * Zentraler Navigations-Katalog – Quelle für Sidebar UND Dashboard-Favoriten.
 * Gruppen nach Arbeitsbereich; Nebensachen (Papierkörbe, Dubletten, Regeln …) als Untermenü,
 * damit jede Rolle nur ihre Bereiche sieht und die Leiste kurz bleibt.
 */
export const NAV: NavDef[] = [
  { href: "/dashboard", label: "Dashboard", perm: null, group: "Start" },
  { href: "/mein", label: "Mein Bereich", perm: "self:view", group: "Start" },

  { href: "/personen", label: "Personen", perm: "person:read", group: "Klient:innen" },
  { href: "/personen/dubletten", label: "Dubletten", perm: "person:write", group: "Klient:innen", parent: "/personen" },
  { href: "/personen/papierkorb", label: "Papierkorb", perm: "person:write", group: "Klient:innen", parent: "/personen" },
  { href: "/karten", label: "Karten", perm: "card:manage", group: "Klient:innen" },
  { href: "/karten/papierkorb", label: "Papierkorb", perm: "card:manage", group: "Klient:innen", parent: "/karten" },
  { href: "/bewilligt", label: "Anträge (Portal)", perm: "person:write", group: "Klient:innen", modul: "portal" },
  { href: "/rueckfragen", label: "Rückfragen", perm: "person:write", group: "Klient:innen", parent: "/bewilligt", modul: "portal" },

  { href: "/ausgabe", label: "Ausgabe starten", perm: "distribution:record", group: "Ausgabe", modul: "station" },
  { href: "/ausgaben", label: "Ausgaben heute", perm: "distribution:record", group: "Ausgabe" },
  { href: "/ausgaben/schulden", label: "Offene Schulden", perm: "distribution:record", group: "Ausgabe", parent: "/ausgaben" },
  { href: "/auswertungen", label: "Auswertungen", perm: "report:view", group: "Ausgabe" },

  { href: "/personal", label: "Personal", perm: "staff:manage", group: "Personal", modul: "personal" },
  { href: "/personal/zivildienst", label: "Zivildienst", perm: "staff:manage", group: "Personal", parent: "/personal", modul: "zivildienst" },
  { href: "/zeit", label: "Zeiterfassung", perm: "staff:manage", group: "Personal", modul: "personal" },
  { href: "/zeit/monat", label: "Monatsauswertung", perm: "staff:manage", group: "Personal", parent: "/zeit", modul: "personal" },
  { href: "/zeit/pruefung", label: "AZG-Prüfung", perm: "staff:manage", group: "Personal", parent: "/zeit", modul: "personal" },
  { href: "/zeit/regeln", label: "Regeln & Feiertage", perm: "staff:manage", group: "Personal", parent: "/zeit", modul: "personal" },
  { href: "/zeit/lohn", label: "Lohnexport", perm: "admin:manage", group: "Personal", parent: "/zeit", modul: "personal" },
  { href: "/dienstplan", label: "Dienstplan", perm: "staff:manage", group: "Personal", modul: "personal" },
  { href: "/abwesenheiten", label: "Abwesenheiten", perm: "staff:manage", group: "Personal", modul: "personal" },
  { href: "/abwesenheiten/konto", label: "Urlaubskonten", perm: "staff:manage", group: "Personal", parent: "/abwesenheiten", modul: "personal" },
  { href: "/urlaub", label: "Urlaubsrechner", perm: "staff:manage", group: "Personal", parent: "/abwesenheiten", modul: "personal" },

  { href: "/touren", label: "Disposition", perm: "tour:manage", group: "Logistik", modul: "touren" },
  { href: "/touren/vorlagen", label: "Wochenplan", perm: "tour:manage", group: "Logistik", parent: "/touren", modul: "touren" },
  { href: "/touren/abholstellen", label: "Abholstellen", perm: "tour:manage", group: "Logistik", parent: "/touren", modul: "touren" },
  { href: "/touren/fahrzeuge", label: "Fahrzeuge", perm: "tour:manage", group: "Logistik", parent: "/touren", modul: "touren" },
  { href: "/touren/fahrer", label: "Fahrer:innen", perm: "tour:manage", group: "Logistik", parent: "/touren", modul: "touren" },
  { href: "/touren/angebote", label: "Angebote (Homepage)", perm: "tour:manage", group: "Logistik", parent: "/touren", modul: "touren" },
  { href: "/touren/standorte", label: "Standorte (Karte)", perm: "tour:manage", group: "Logistik", parent: "/touren", modul: "touren" },

  { href: "/admin", label: "Stammdaten", perm: "admin:manage", group: "Verwaltung" },
  { href: "/admin/ausgabestation", label: "Ausgabestation", perm: "admin:manage", group: "Verwaltung", parent: "/admin", modul: "station" },
  { href: "/admin/benutzer", label: "Benutzer", perm: "admin:manage", group: "Verwaltung" },
  { href: "/admin/import", label: "Datenübernahme", perm: "admin:manage", group: "Verwaltung" },
  { href: "/admin/migration", label: "Altsystem", perm: "admin:manage", group: "Verwaltung", parent: "/admin/import" },
  { href: "/admin/pilot", label: "Pilot am Tresen", perm: "admin:manage", group: "Verwaltung", parent: "/admin/import" },
];

/** Alle Nav-Einträge, die die Rolle sehen darf – und deren Modul beim Mandanten an ist. */
export function navFor(role: Role, module?: Record<string, boolean> | null): NavDef[] {
  return NAV.filter((n) => (n.perm === null || hasPermission(role, n.perm)) && (!n.modul || modulAktiv(module, n.modul)));
}

/** Sichtbare Nav-Einträge nach Gruppen (leere Gruppen entfallen). */
export interface NavEintrag { href: string; label: string; children?: { href: string; label: string }[] }

export function navGroups(role: Role, module?: Record<string, boolean> | null): { title: NavGroupTitle; items: NavEintrag[] }[] {
  const order: NavGroupTitle[] = ["Start", "Klient:innen", "Ausgabe", "Personal", "Logistik", "Verwaltung"];
  const visible = navFor(role, module);
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
  const n = NAV.find((x) => x.href === href);
  if (!n) return href;
  // Unterpunkte mit Eltern-Namen, sonst hiessen zwei Kacheln "Papierkorb"
  const eltern = n.parent ? NAV.find((x) => x.href === n.parent) : null;
  return eltern ? `${eltern.label} · ${n.label}` : n.label;
}

/**
 * Fenstertitel zu einem Pfad: Name des Moduls (laengster passender Nav-Eintrag), damit in der
 * Taskleiste "Personen" statt zehnmal "Tafelwerk" steht. Dashboard und Unbekanntes: "Tafelwerk".
 */
export function fensterTitel(pathname: string): string {
  if (pathname === "/dashboard" || pathname === "/") return "Tafelwerk";
  let best: NavDef | null = null;
  for (const n of NAV) {
    if (n.href === "/dashboard") continue;
    if ((pathname === n.href || pathname.startsWith(n.href + "/")) && (!best || n.href.length > best.href.length)) best = n;
  }
  if (!best) return "Tafelwerk";
  const treffer = best;
  const eltern = treffer.parent ? NAV.find((x) => x.href === treffer.parent) : null;
  return eltern ? `${eltern.label} · ${treffer.label}` : treffer.label;
}

/** Als Favorit hinzufügbar? (Dashboard selbst ausgenommen.) */
export function isFavoritable(href: string): boolean {
  return href !== "/dashboard" && NAV.some((n) => n.href === href);
}
