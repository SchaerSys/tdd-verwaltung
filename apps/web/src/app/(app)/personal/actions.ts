"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { staff } from "@tdd/db";
import { db } from "@/lib/db";
import { normalizeNfcId } from "@/lib/nfc";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { STAFF_TYPES } from "./types";

const guard = () => requirePermission("staff:manage");
const str = (fd: FormData, k: string): string | null => { const v = String(fd.get(k) ?? "").trim(); return v === "" ? null : v; };
const dec = (fd: FormData, k: string): string | null => { const v = str(fd, k); if (v == null) return null; const n = Number(v.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? String(n) : null; };
const intId = (fd: FormData, k: string): number | null => { const v = str(fd, k); if (v == null) return null; const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const type = (fd: FormData): string => { const t = String(fd.get("staffType") ?? "ANGESTELLT"); return (STAFF_TYPES as readonly string[]).includes(t) ? t : "ANGESTELLT"; };

export async function createStaff(fd: FormData): Promise<void> {
  const u = await guard();
  const firstName = str(fd, "firstName"); const lastName = str(fd, "lastName");
  if (!firstName || !lastName) { revalidatePath("/personal"); return; }
  const staffType = type(fd);
  await db().insert(staff).values({
    firstName, lastName, staffType,
    email: str(fd, "email"), phone: str(fd, "phone"), locationId: intId(fd, "locationId"),
    employmentStart: str(fd, "employmentStart"), employmentEnd: str(fd, "employmentEnd"),
    weeklyHours: dec(fd, "weeklyHours"), vacationDaysYear: dec(fd, "vacationDaysYear"),
    nfcCardId: normalizeNfcId(str(fd, "nfcCardId")), note: str(fd, "note"),
    kannFahren: staffType === "FAHRER" || fd.get("kannFahren") === "on", // Fahrer:in ist sofort in der Disposition waehlbar
  });
  await audit({ actorUserId: u.id, action: "staff.create", entityType: "staff", entityId: `${lastName} ${firstName}` });
  revalidatePath("/personal");
}

export async function updateStaff(fd: FormData): Promise<void> {
  const u = await guard();
  const id = String(fd.get("id") ?? ""); if (!id) throw new Error("Kein Datensatz");
  const firstName = str(fd, "firstName"); const lastName = str(fd, "lastName");
  if (!firstName || !lastName) throw new Error("Vor- und Nachname sind Pflicht.");
  const staffType = type(fd);
  await db().update(staff).set({
    firstName, lastName, staffType,
    email: str(fd, "email"), phone: str(fd, "phone"), locationId: intId(fd, "locationId"),
    employmentStart: str(fd, "employmentStart"), employmentEnd: str(fd, "employmentEnd"),
    weeklyHours: dec(fd, "weeklyHours"), vacationDaysYear: dec(fd, "vacationDaysYear"),
    nfcCardId: normalizeNfcId(str(fd, "nfcCardId")), note: str(fd, "note"), updatedAt: new Date(),
    // A4: Fahrer-Eigenschaften und Login-Verknuepfung (fuer die Tour am Handy)
    kannFahren: staffType === "FAHRER" || fd.get("kannFahren") === "on", fuehrerschein: str(fd, "fuehrerschein"),
    fahrerTage: fd.getAll("fahrerTage").map(Number).filter((n) => n >= 1 && n <= 7),
    userId: str(fd, "userId") || null,
  }).where(eq(staff.id, id));
  await audit({ actorUserId: u.id, action: "staff.update", entityType: "staff", entityId: id });
  redirect("/personal");
}

export async function toggleStaffActive(fd: FormData): Promise<void> {
  const u = await guard();
  const id = String(fd.get("id") ?? ""); const active = String(fd.get("active") ?? "") === "1";
  if (!id) return;
  await db().update(staff).set({ isActive: active, updatedAt: new Date() }).where(eq(staff.id, id));
  await audit({ actorUserId: u.id, action: active ? "staff.activate" : "staff.deactivate", entityType: "staff", entityId: id });
  revalidatePath("/personal");
}
