"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { locations } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { geocode } from "@/lib/geo";

/** Strasse/PLZ eines Standorts speichern und gleich geocodieren. */
export async function standortAdresse(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = Number(fd.get("id"));
  const strasse = String(fd.get("strasse") ?? "").trim() || null;
  const plz = String(fd.get("plz") ?? "").trim() || null;
  if (!id) return;
  const l = (await db().select().from(locations).where(eq(locations.id, id)).limit(1))[0];
  if (!l) return;
  const p = await geocode([strasse, [plz, l.city].filter(Boolean).join(" ")].filter(Boolean).join(", "));
  const gf = parseInt(String(fd.get("geofenceM") ?? ""), 10);
  await db().update(locations).set({ strasse, plz, ...(Number.isFinite(gf) ? { geofenceM: Math.min(1000, Math.max(30, gf)) } : {}), ...(p ? { lat: p.lat, lng: p.lng } : {}) }).where(eq(locations.id, id));
  await audit({ actorUserId: u.id, action: "location.address", entityType: "location", entityId: String(id), after: { strasse, plz, gefunden: p?.anzeige ?? null } });
  revalidatePath("/touren/standorte");
}
