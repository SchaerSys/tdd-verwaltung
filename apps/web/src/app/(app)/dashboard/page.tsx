import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { locations as locTable } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { navLabel } from "@/lib/nav";
import { getPrefs } from "@/lib/dashboard-prefs";
import { loadDashboard } from "./data";
import { DashboardLive } from "./DashboardLive";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const data = await loadDashboard();
  const canWrite = user ? hasPermission(user.role, "person:write") : false;

  const prefs = user ? await getPrefs(user.id) : { favorites: [], widgets: [], navCollapsed: false };
  const favTiles = prefs.favorites.map((href) => ({ href, label: navLabel(href) }));
  const locs = await db()
    .select({ id: locTable.id, name: locTable.name, type: locTable.type, openingHours: locTable.openingHours })
    .from(locTable)
    .where(eq(locTable.isActive, true))
    .orderBy(asc(locTable.type), asc(locTable.name));

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Angemeldet als {user?.displayName}{data ? "" : " · Datenbank noch nicht bereit"}</div>
        </div>
        {canWrite ? <Link href="/personen/neu" className="btn primary">＋ Person aufnehmen</Link> : null}
      </div>

      <DashboardLive initial={data} favorites={favTiles} widgets={prefs.widgets} locations={locs} />
    </div>
  );
}
