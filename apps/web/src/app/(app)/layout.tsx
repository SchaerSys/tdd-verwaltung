import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { locations } from "@tdd/db";
import { getCurrentUser, logout } from "@/lib/auth";
import { db } from "@/lib/db";
import { navGroups } from "@/lib/nav";
import { getPrefs } from "@/lib/dashboard-prefs";
import { AppShell } from "@/components/AppShell";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "SACHBEARBEITER") redirect("/portal");
  // Zivildiener/Ausgabe: ausschließlich Tresen-Kiosk, kein Einblick ins Backoffice.
  if (user.role === "AUSGABE") redirect("/kiosk");

  const groups = navGroups(user.role);
  const prefs = await getPrefs(user.id);

  let locationName = "Alle Standorte";
  if (user.locationId) {
    const rows = await db().select({ name: locations.name }).from(locations).where(eq(locations.id, user.locationId)).limit(1);
    if (rows[0]) locationName = rows[0].name;
  }

  const initials = user.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <AppShell
      groups={groups}
      user={{ displayName: user.displayName, role: user.role }}
      roleLabel={roleLabel(user.role)}
      locationName={locationName}
      initials={initials}
      favorites={prefs.favorites}
      collapsedInit={prefs.navCollapsed}
      logout={logoutAction}
    >
      {children}
    </AppShell>
  );
}

function roleLabel(role: string): string {
  return { ADMIN: "Admin", ERFASSUNG: "Erfassung", AUSGABE: "Kasse", AUSWERTUNG: "Auswertung" }[role] ?? role;
}
