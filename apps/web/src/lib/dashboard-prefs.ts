import { eq } from "drizzle-orm";
import { userDashboardPrefs } from "@tdd/db";
import { db } from "./db";

export type WidgetSpec =
  | { type: "weather" }
  | { type: "location"; id: number }
  | { type: "expiring" }
  | { type: "recent" };

export interface DashboardPrefs {
  favorites: string[];
  widgets: WidgetSpec[];
  navCollapsed: boolean;
}

const EMPTY: DashboardPrefs = { favorites: [], widgets: [], navCollapsed: false };

/** Persönliche Dashboard-Einstellungen laden (leer, wenn noch keine gespeichert). */
export async function getPrefs(userId: string): Promise<DashboardPrefs> {
  const rows = await db().select().from(userDashboardPrefs).where(eq(userDashboardPrefs.userId, userId)).limit(1);
  const r = rows[0];
  if (!r) return { ...EMPTY };
  return {
    favorites: Array.isArray(r.favorites) ? (r.favorites as string[]) : [],
    widgets: Array.isArray(r.widgets) ? (r.widgets as WidgetSpec[]) : [],
    navCollapsed: !!r.navCollapsed,
  };
}

/** Vollständige Einstellungen speichern (Upsert je Benutzer). */
export async function savePrefs(userId: string, prefs: DashboardPrefs): Promise<void> {
  await db()
    .insert(userDashboardPrefs)
    .values({ userId, favorites: prefs.favorites, widgets: prefs.widgets, navCollapsed: prefs.navCollapsed })
    .onConflictDoUpdate({
      target: userDashboardPrefs.userId,
      set: { favorites: prefs.favorites, widgets: prefs.widgets, navCollapsed: prefs.navCollapsed, updatedAt: new Date() },
    });
}

/** Zwei Widget-Specs gleich? (für Hinzufügen/Entfernen ohne Duplikate) */
export function sameWidget(a: WidgetSpec, b: WidgetSpec): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "location" && b.type === "location") return a.id === b.id;
  return true;
}
