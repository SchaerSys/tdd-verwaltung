"use server";

import { revalidatePath } from "next/cache";
import { staff } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";

const str = (fd: FormData, k: string): string | null => { const v = String(fd.get(k) ?? "").trim(); return v || null; };

/** Fahrer:in ohne Login hinterlegen – landet im Personal-Verzeichnis mit „fährt Touren“. */
export async function fahrerAnlegen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const firstName = str(fd, "firstName"); const lastName = str(fd, "lastName");
  if (!firstName || !lastName) throw new Error("Vor- und Nachname sind Pflicht.");
  const artRoh = str(fd, "staffType") ?? "FAHRER";
  const staffType = ["FAHRER", "EHRENAMT", "ZIVILDIENER", "ANGESTELLT"].includes(artRoh) ? artRoh : "FAHRER";
  const { naechstePersonalnr } = await import("@/lib/personalnr");
  const r = await db().insert(staff).values({
    personalnr: await naechstePersonalnr(staffType), firstName, lastName, staffType, kannFahren: true, phone: str(fd, "phone"),
    strasse: str(fd, "strasse"), plz: str(fd, "plz"), ort: str(fd, "ort"), fuehrerschein: str(fd, "fuehrerschein"),
    fahrerTage: fd.getAll("fahrerTage").map(Number).filter((n) => n >= 1 && n <= 7),
  }).returning({ id: staff.id });
  await audit({ actorUserId: u.id, action: "staff.create", entityType: "staff", entityId: r[0]!.id, after: { fahrer: true } });
  revalidatePath("/touren/fahrer"); revalidatePath("/personal"); revalidatePath("/touren");
}
