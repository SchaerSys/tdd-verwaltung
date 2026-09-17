import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { locations, persons, personLocationAssignments, organizations } from "@tdd/db";
import { getCurrentUser, logout } from "@/lib/auth";
import { db } from "@/lib/db";
import { navGroups } from "@/lib/nav";
import { getPrefs } from "@/lib/dashboard-prefs";
import { AppShell } from "@/components/AppShell";
import { hasPermission } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import type { Uebernahme } from "@/components/UebernahmenReiter";
import { mandant } from "@/lib/mandant";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/passwort-aendern"); // Initialpasswort zuerst ersetzen
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

  // Bewilligte, noch nicht uebernommene Antraege fuer den Reiter rechts – nur wer uebernehmen darf.
  let uebernahmen: Uebernahme[] = [];
  if (hasPermission(user.role, "person:write")) {
    const rows = await db()
      .select({
        id: persons.id, first: persons.firstName, last: persons.lastName, createdAt: persons.createdAt,
        loc: locations.name, locTyp: locations.type, org: organizations.name, orgTyp: organizations.type,
      })
      .from(persons)
      .leftJoin(personLocationAssignments, and(eq(personLocationAssignments.personId, persons.id), eq(personLocationAssignments.isActive, true)))
      .leftJoin(locations, eq(personLocationAssignments.locationId, locations.id))
      .leftJoin(organizations, eq(persons.sourceOrganizationId, organizations.id))
      .where(and(eq(persons.takeoverPending, true), isNull(persons.deletedAt)))
      .orderBy(desc(persons.createdAt))
      .limit(50);
    uebernahmen = rows.map((r) => ({
      id: r.id, name: `${r.last}, ${r.first}`, org: r.org ?? null, orgTyp: r.orgTyp ?? null,
      loc: r.loc ?? null, locTyp: r.locTyp ?? null, seit: fmtDate(r.createdAt),
    }));
  }

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
      uebernahmen={uebernahmen}
      traeger={(await mandant()).kurzname}
    >
      {children}
    </AppShell>
  );
}

function roleLabel(role: string): string {
  return { ADMIN: "Admin", ERFASSUNG: "Erfassung", AUSGABE: "Kasse", AUSWERTUNG: "Auswertung" }[role] ?? role;
}
