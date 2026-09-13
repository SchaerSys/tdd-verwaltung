import { getCurrentUser, type CurrentUser } from "./auth";
import { hasPermission, type Permission } from "./rbac";

/** Fehlende Berechtigung – bewusst ohne Detail nach außen. */
export class Forbidden extends Error {
  constructor() {
    super("Keine Berechtigung");
    this.name = "Forbidden";
  }
}

/**
 * Liefert den angemeldeten Benutzer oder wirft. Mehrere Rechte = ODER
 * (z. B. Kiosk-Kartenausstellung: distribution:record ODER card:manage).
 * Ersetzt die gleichlautenden guard()-Funktionen in den Server Actions,
 * damit eine vergessene Prüfung an einer Stelle auffällt statt in 47.
 */
export async function requirePermission(...perms: Permission[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Forbidden();
  if (perms.length && !perms.some((p) => hasPermission(user.role, p))) throw new Forbidden();
  return user;
}

/** Wie requirePermission, aber ohne Wurf – für Actions mit Result-Rückgabe. */
export async function tryPermission(...perms: Permission[]): Promise<CurrentUser | null> {
  try {
    return await requirePermission(...perms);
  } catch {
    return null;
  }
}
