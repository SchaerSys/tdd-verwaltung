"use server";

import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { staff, staffDokumente } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { deleteFiles } from "@/lib/purge";
import { BESCHAEFTIGUNG_LABEL, AUSTRITT_GRUND_LABEL, DOK_ART_LABEL, svNummerGueltig } from "@/lib/personalakte";

/** Personalakte enthält Gehalt/SV-Nummer/Dokumente – nur Admin (staff:manage ist ohnehin Admin, admin:manage zur Sicherheit). */
const guard = () => requirePermission("staff:manage", "admin:manage");
const str = (fd: FormData, k: string): string | null => { const v = String(fd.get(k) ?? "").trim(); return v === "" ? null : v; };
const datum = (fd: FormData, k: string): string | null => { const v = str(fd, k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
const wahl = (fd: FormData, k: string, erlaubt: Record<string, string>): string | null => { const v = str(fd, k); return v && v in erlaubt ? v : null; };

export async function akteSpeichern(fd: FormData): Promise<void> {
  const u = await guard();
  const id = String(fd.get("staffId") ?? ""); if (!id) throw new Error("Kein Datensatz");
  const sv = str(fd, "svNummer")?.replace(/\s/g, "") ?? null;
  if (sv && !svNummerGueltig(sv)) throw new Error("SV-Nummer hat keine gültige Prüfziffer.");
  const gehalt = str(fd, "gehaltBrutto"); const gehaltNum = gehalt ? Number(gehalt.replace(",", ".")) : null;
  await db().update(staff).set({
    geburtsdatum: datum(fd, "geburtsdatum"), svNummer: sv, staatsbuergerschaft: str(fd, "staatsbuergerschaft"),
    beschaeftigung: wahl(fd, "beschaeftigung", BESCHAEFTIGUNG_LABEL), taetigkeit: str(fd, "taetigkeit"), kvEinstufung: str(fd, "kvEinstufung"),
    gehaltBrutto: gehaltNum != null && Number.isFinite(gehaltNum) && gehaltNum >= 0 ? gehaltNum.toFixed(2) : null,
    probezeitBis: datum(fd, "probezeitBis"), befristetBis: datum(fd, "befristetBis"), kuendigungsfrist: str(fd, "kuendigungsfrist"),
    dienstzettelAm: datum(fd, "dienstzettelAm"), notfallName: str(fd, "notfallName"), notfallTel: str(fd, "notfallTel"),
    austrittGrund: wahl(fd, "austrittGrund", AUSTRITT_GRUND_LABEL), updatedAt: new Date(),
  }).where(eq(staff.id, id));
  // Kein Gehalt/SV im Protokoll – nur dass die Akte geändert wurde
  await audit({ actorUserId: u.id, action: "staff.akte.update", entityType: "staff", entityId: id });
  revalidatePath(`/personal/${id}`);
}

function extFor(name: string, type: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]{2,4})$/);
  if (m && ["pdf", "png", "jpg", "jpeg", "webp", "docx"].includes(m[1]!)) return m[1]!;
  if (type.includes("pdf")) return "pdf";
  if (type.includes("png")) return "png";
  if (type.includes("jpeg")) return "jpg";
  return "bin";
}

export async function dokumentHochladen(fd: FormData): Promise<void> {
  const u = await guard();
  const staffId = String(fd.get("staffId") ?? "");
  const art = wahl(fd, "art", DOK_ART_LABEL) ?? "SONSTIG";
  const file = fd.get("file");
  if (!staffId || !(file instanceof File) || file.size === 0) throw new Error("Keine Datei");
  if (file.size > 20 * 1024 * 1024) throw new Error("Datei größer als 20 MB");
  const ext = extFor(file.name, file.type);
  if (ext === "bin") throw new Error("Nur PDF, Bilder oder DOCX");

  const base = process.env.STORAGE_DIR ?? "./data/uploads";
  await mkdir(join(base, "personal"), { recursive: true });
  const fileRef = `personal/${randomUUID()}.${ext}`;
  await writeFile(join(base, fileRef), Buffer.from(await file.arrayBuffer()));

  const bezeichnung = str(fd, "bezeichnung") ?? file.name.replace(/\.[a-z0-9]{2,4}$/i, "");
  await db().insert(staffDokumente).values({ staffId, art, bezeichnung, fileRef, gueltigBis: datum(fd, "gueltigBis"), uploadedBy: u.id });
  await audit({ actorUserId: u.id, action: "staff.dokument.add", entityType: "staff", entityId: staffId, after: { art } });
  revalidatePath(`/personal/${staffId}`);
}

export async function dokumentLoeschen(fd: FormData): Promise<void> {
  const u = await guard();
  const id = String(fd.get("id") ?? ""); if (!id) return;
  const rows = await db().delete(staffDokumente).where(eq(staffDokumente.id, id)).returning({ staffId: staffDokumente.staffId, fileRef: staffDokumente.fileRef, art: staffDokumente.art });
  const d = rows[0]; if (!d) return;
  await deleteFiles([d.fileRef]);
  await audit({ actorUserId: u.id, action: "staff.dokument.delete", entityType: "staff", entityId: d.staffId, before: { art: d.art } });
  revalidatePath(`/personal/${d.staffId}`);
}
