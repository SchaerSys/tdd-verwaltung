import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { locations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser, logout } from "@/lib/auth";
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
  return <KioskClient locationName={locationName} initialCards={initialCards} logout={logoutAction} />;
}
