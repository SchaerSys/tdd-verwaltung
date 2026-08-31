"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { users, locations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { appUrl } from "@/lib/auth-tokens";
import { WEEKDAYS } from "@/lib/opening-hours";

const INTERNAL_ROLES = ["ADMIN", "ERFASSUNG", "AUSGABE", "AUSWERTUNG"] as const;

/** Legt einen internen TDD-Benutzer an (Zivildiener etc.) mit gewählter Rolle. */
export async function createUser(formData: FormData): Promise<void> {
  const admin = await getCurrentUser();
  if (!admin || !hasPermission(admin.role, "admin:manage")) throw new Error("Keine Berechtigung");
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const pw = String(formData.get("password") ?? "");
  const locRaw = formData.get("locationId");
  const locationId = locRaw && String(locRaw) !== "" ? parseInt(String(locRaw), 10) : null;
  if (!email || !displayName || !(INTERNAL_ROLES as readonly string[]).includes(role) || pw.length < 8) { revalidatePath("/admin"); return; }

  const exists = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (exists[0]) { revalidatePath("/admin"); return; }

  await db().insert(users).values({
    email, passwordHash: await hash(pw), displayName, role, locationId, isActive: true, emailVerified: true,
  });
  await audit({ actorUserId: admin.id, action: "user.create", entityType: "user", entityId: email, after: { role, locationId } });
  revalidatePath("/admin");
}

/** Ändert die Rolle eines Benutzers. */
export async function setUserRole(formData: FormData): Promise<void> {
  const admin = await getCurrentUser();
  if (!admin || !hasPermission(admin.role, "admin:manage")) throw new Error("Keine Berechtigung");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || !(INTERNAL_ROLES as readonly string[]).includes(role)) { revalidatePath("/admin"); return; }
  if (userId === admin.id) { revalidatePath("/admin"); return; } // eigene Rolle nicht ändern
  await db().update(users).set({ role }).where(eq(users.id, userId));
  await audit({ actorUserId: admin.id, action: "user.role", entityType: "user", entityId: userId, after: { role } });
  revalidatePath("/admin");
}

/** Aktiviert/sperrt einen Benutzer. */
export async function toggleUserActive(formData: FormData): Promise<void> {
  const admin = await getCurrentUser();
  if (!admin || !hasPermission(admin.role, "admin:manage")) throw new Error("Keine Berechtigung");
  const userId = String(formData.get("userId") ?? "");
  const active = String(formData.get("active") ?? "") === "1";
  if (!userId || userId === admin.id) { revalidatePath("/admin"); return; }
  await db().update(users).set({ isActive: active }).where(eq(users.id, userId));
  await audit({ actorUserId: admin.id, action: active ? "user.activate" : "user.deactivate", entityType: "user", entityId: userId });
  revalidatePath("/admin");
}

/** Gibt eine bestätigte Registrierung frei (Login danach möglich). */
export async function approveUser(formData: FormData): Promise<void> {
  const admin = await getCurrentUser();
  if (!admin || !hasPermission(admin.role, "admin:manage")) throw new Error("Keine Berechtigung");
  const userId = String(formData.get("userId") ?? "");
  const rows = await db().select({ email: users.email, name: users.displayName, active: users.isActive }).from(users).where(eq(users.id, userId)).limit(1);
  const u = rows[0];
  if (!u || u.active) { revalidatePath("/admin"); return; }

  await db().update(users).set({ isActive: true }).where(eq(users.id, userId));
  await sendMail({ to: u.email, subject: "TDD-Verwaltung – Zugang freigegeben",
    text: `Guten Tag ${u.name},\n\nIhr Zugang wurde freigegeben. Sie können sich jetzt anmelden:\n${appUrl()}/login\n\nFreundliche Grüße\nTischlein deck dich` });
  await audit({ actorUserId: admin.id, action: "user.approve", entityType: "user", entityId: userId });
  revalidatePath("/admin");
}

/** Lehnt eine Registrierung ab (Konto wird entfernt). */
export async function rejectUser(formData: FormData): Promise<void> {
  const admin = await getCurrentUser();
  if (!admin || !hasPermission(admin.role, "admin:manage")) throw new Error("Keine Berechtigung");
  const userId = String(formData.get("userId") ?? "");
  // Nur nicht-aktive (ausstehende) Registrierungen dürfen gelöscht werden
  const rows = await db().select({ active: users.isActive }).from(users).where(eq(users.id, userId)).limit(1);
  if (!rows[0] || rows[0].active) { revalidatePath("/admin"); return; }
  await db().delete(users).where(eq(users.id, userId));
  await audit({ actorUserId: admin.id, action: "user.reject", entityType: "user", entityId: userId });
  revalidatePath("/admin");
}

/** Setzt die Preisregel (Betrag je Erwachsener/Kind) einer Ausgabestelle. */
export async function setLocationPrice(formData: FormData): Promise<void> {
  const admin = await getCurrentUser();
  if (!admin || !hasPermission(admin.role, "admin:manage")) throw new Error("Keine Berechtigung");
  const locId = parseInt(String(formData.get("locationId") ?? ""), 10);
  const parse = (v: FormDataEntryValue | null) => {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  };
  const pa = parse(formData.get("priceAdult"));
  const pc = parse(formData.get("priceChild"));
  const gcRaw = parseInt(String(formData.get("groupCount") ?? ""), 10);
  const gc = Number.isFinite(gcRaw) && gcRaw >= 1 && gcRaw <= 99 ? gcRaw : null;
  if (!locId || pa == null || pc == null) { revalidatePath("/admin"); return; }
  await db().update(locations).set({ priceAdult: String(pa), priceChild: String(pc), ...(gc != null ? { groupCount: gc } : {}) }).where(eq(locations.id, locId));
  await audit({ actorUserId: admin.id, action: "location.price", entityType: "location", entityId: String(locId), after: { priceAdult: pa, priceChild: pc, groupCount: gc } });
  revalidatePath("/admin");
}

/** Setzt die Öffnungszeiten (ein Zeitfenster je Wochentag) eines Standorts. */
export async function setLocationHours(formData: FormData): Promise<void> {
  const admin = await getCurrentUser();
  if (!admin || !hasPermission(admin.role, "admin:manage")) throw new Error("Keine Berechtigung");
  const locId = parseInt(String(formData.get("locationId") ?? ""), 10);
  if (!locId) { revalidatePath("/admin"); return; }

  const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const oh: Record<string, { from: string; to: string }[]> = {};
  for (const d of WEEKDAYS) {
    const f = String(formData.get(`${d}_from`) ?? "").trim();
    const t = String(formData.get(`${d}_to`) ?? "").trim();
    if (hm.test(f) && hm.test(t) && f < t) oh[d] = [{ from: f, to: t }];
  }
  const value = Object.keys(oh).length ? oh : null;
  await db().update(locations).set({ openingHours: value }).where(eq(locations.id, locId));
  await audit({ actorUserId: admin.id, action: "location.hours", entityType: "location", entityId: String(locId), after: value });
  revalidatePath("/admin");
}
