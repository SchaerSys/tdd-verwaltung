import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { locations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser, logout } from "@/lib/auth";
import { personWechseln } from "@/app/ausgabe/actions";
import { getActiveCards } from "./actions";
import { KioskClient } from "./KioskClient";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function KioskPage() {
  const user = await getCurrentUser();
  let locationName = "Alle Standorte";
  if (user?.locationId) {
    const r = await db().select({ name: locations.name }).from(locations).where(eq(locations.id, user.locationId)).limit(1);
    if (r[0]) locationName = r[0].name;
  }
  const initialCards = await getActiveCards();
  if (user?.sitzungId) {
    // Ausgabe-Sitzung (Station oder Buero): Abmelden = Person wechseln, dazu der Abschluss
    return <KioskClient locationName={locationName} initialCards={initialCards} logout={personWechseln} abschlussHref="/ausgabe/abschluss" wer={user.displayName} />;
  }
  return <KioskClient locationName={locationName} initialCards={initialCards} logout={logoutAction} />;
}
