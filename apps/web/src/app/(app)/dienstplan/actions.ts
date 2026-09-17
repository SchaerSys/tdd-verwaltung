"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";
import { abwesenheiten, dienste, dienstplanWochen, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { diensteDerWoche } from "@/lib/dienstplan-daten";
import { plusTage, TAETIGKEIT_LABEL, wocheAusStandard, wochenStart, zeitMin, type DienstStandard } from "@/lib/dienstplan";

const str = (fd: FormData, k: string): string | null => { const v = String(fd.get(k) ?? "").trim(); return v || null; };
const datum = (v: string | null): string | null => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const zeit = (v: string | null): string | null => (v && /^\d{2}:\d{2}$/.test(v) ? v : null);
const alles = () => { revalidatePath("/dienstplan"); revalidatePath("/druck/dienstplan"); revalidatePath("/mein"); };

/** Dienst anlegen oder (mit id) ändern. */
export async function dienstSpeichern(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const id = str(fd, "id");
  const staffId = str(fd, "staffId"); const tag = datum(str(fd, "datum"));
  const von = zeit(str(fd, "von")); const bis = zeit(str(fd, "bis"));
  const pauseMin = Math.max(0, parseInt(str(fd, "pauseMin") ?? "0", 10) || 0);
  const taetigkeit = str(fd, "taetigkeit") ?? "AUSGABE";
  const locRaw = str(fd, "locationId"); const locationId = locRaw ? parseInt(locRaw, 10) : null;
  if (!staffId || !tag || !von || !bis || zeitMin(bis) <= zeitMin(von) || !(taetigkeit in TAETIGKEIT_LABEL)) throw new Error("Person, Tag und Zeit (bis nach von) sind Pflicht.");
  const werte = { staffId, datum: tag, von, bis, pauseMin, taetigkeit, locationId: locationId != null && Number.isFinite(locationId) ? locationId : null, notiz: str(fd, "notiz"), updatedAt: new Date() };
  if (id) {
    await db().update(dienste).set(werte).where(eq(dienste.id, id));
    await audit({ actorUserId: u.id, action: "dienst.update", entityType: "dienst", entityId: id, after: { datum: tag, von, bis } });
  } else {
    const r = await db().insert(dienste).values({ ...werte, createdBy: u.id }).returning({ id: dienste.id });
    await audit({ actorUserId: u.id, action: "dienst.create", entityType: "dienst", entityId: r[0]!.id, after: { staffId, datum: tag, von, bis } });
  }
  alles();
  redirect(`/dienstplan?woche=${wochenStart(tag)}`);
}

export async function dienstLoeschen(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const id = String(fd.get("id") ?? "");
  const r = await db().delete(dienste).where(eq(dienste.id, id)).returning({ datum: dienste.datum, staffId: dienste.staffId, von: dienste.von, bis: dienste.bis });
  if (r[0]) await audit({ actorUserId: u.id, action: "dienst.delete", entityType: "dienst", entityId: id, before: r[0] });
  alles();
}

async function genehmigteAbwesenheiten(woche: string) {
  return db().select({ staffId: abwesenheiten.staffId, von: abwesenheiten.von, bis: abwesenheiten.bis }).from(abwesenheiten)
    .where(and(eq(abwesenheiten.status, "GENEHMIGT"), lte(abwesenheiten.von, plusTage(woche, 6)), gte(abwesenheiten.bis, woche)));
}

/**
 * Woche aus den Standard-Diensten füllen: nur Personen, die in der Woche noch keinen Dienst haben;
 * Tage mit genehmigter Abwesenheit werden ausgelassen.
 */
export async function wocheFuellen(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const woche = datum(str(fd, "woche")); if (!woche) return;
  const [leute, vorhandene, abw] = await Promise.all([
    db().select({ id: staff.id, standard: staff.dienstStandard }).from(staff).where(eq(staff.isActive, true)),
    diensteDerWoche(woche), genehmigteAbwesenheiten(woche),
  ]);
  const belegt = new Set(vorhandene.map((d) => d.staffId));
  const neu = leute.filter((p) => !belegt.has(p.id)).flatMap((p) => wocheAusStandard(p.id, (p.standard as DienstStandard | null) ?? null, woche))
    .filter((d) => !abw.some((a) => a.staffId === d.staffId && a.von <= d.datum && a.bis >= d.datum));
  if (neu.length) await db().insert(dienste).values(neu.map((d) => ({ ...d, createdBy: u.id })));
  await audit({ actorUserId: u.id, action: "dienstplan.fuellen", entityType: "dienstplan", entityId: woche, after: { dienste: neu.length } });
  alles();
}

/** Vorwoche kopieren – für Personen ohne Dienst in der Zielwoche, Abwesenheitstage ausgelassen. */
export async function wocheKopieren(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const woche = datum(str(fd, "woche")); if (!woche) return;
  const quelle = plusTage(woche, -7);
  const [alt, vorhandene, abw] = await Promise.all([diensteDerWoche(quelle), diensteDerWoche(woche), genehmigteAbwesenheiten(woche)]);
  const belegt = new Set(vorhandene.map((d) => d.staffId));
  const neu = alt.filter((d) => !belegt.has(d.staffId))
    .map((d) => ({ staffId: d.staffId, datum: plusTage(d.datum, 7), von: d.von, bis: d.bis, pauseMin: d.pauseMin, taetigkeit: d.taetigkeit, locationId: d.locationId, notiz: d.notiz, createdBy: u.id }))
    .filter((d) => !abw.some((a) => a.staffId === d.staffId && a.von <= d.datum && a.bis >= d.datum));
  if (neu.length) await db().insert(dienste).values(neu);
  await audit({ actorUserId: u.id, action: "dienstplan.kopieren", entityType: "dienstplan", entityId: woche, after: { von: quelle, dienste: neu.length } });
  alles();
}

/** Alle Dienste einer Woche löschen (nur im Entwurf, nur Admin). */
export async function wocheLeeren(fd: FormData): Promise<void> {
  const u = await requirePermission("admin:manage");
  const woche = datum(str(fd, "woche")); if (!woche) return;
  const w = (await db().select().from(dienstplanWochen).where(eq(dienstplanWochen.wocheStart, woche)).limit(1))[0];
  if (w?.status === "VEROEFFENTLICHT") throw new Error("Veröffentlichte Woche zuerst auf Entwurf zurücksetzen.");
  const r = await db().delete(dienste).where(and(gte(dienste.datum, woche), lte(dienste.datum, plusTage(woche, 6)))).returning({ id: dienste.id });
  await audit({ actorUserId: u.id, action: "dienstplan.leeren", entityType: "dienstplan", entityId: woche, before: { dienste: r.length } });
  alles();
}

/** Veröffentlichen (sichtbar in „Mein Bereich“) oder zurück auf Entwurf. */
export async function wocheStatus(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const woche = datum(str(fd, "woche")); if (!woche) return;
  const status = str(fd, "status") === "VEROEFFENTLICHT" ? "VEROEFFENTLICHT" : "ENTWURF";
  const set = { status, veroeffentlichtAt: status === "VEROEFFENTLICHT" ? new Date() : null, veroeffentlichtBy: status === "VEROEFFENTLICHT" ? u.id : null };
  await db().insert(dienstplanWochen).values({ wocheStart: woche, ...set }).onConflictDoUpdate({ target: [dienstplanWochen.tenantId, dienstplanWochen.wocheStart], set });
  await audit({ actorUserId: u.id, action: status === "VEROEFFENTLICHT" ? "dienstplan.veroeffentlicht" : "dienstplan.entwurf", entityType: "dienstplan", entityId: woche });
  alles();
}

/** Standard-Dienst je Wochentag am Personal-Datensatz. */
export async function standardSpeichern(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const staffId = str(fd, "staffId"); if (!staffId) return;
  const standard: DienstStandard = {};
  for (let t = 1; t <= 7; t++) {
    const von = zeit(str(fd, `von${t}`)); const bis = zeit(str(fd, `bis${t}`));
    if (!von || !bis || zeitMin(bis) <= zeitMin(von)) continue;
    const loc = str(fd, `loc${t}`); const taet = str(fd, `taet${t}`) ?? "AUSGABE";
    standard[String(t)] = { von, bis, pause: Math.max(0, parseInt(str(fd, `pause${t}`) ?? "0", 10) || 0), location: loc ? parseInt(loc, 10) : null, taetigkeit: taet in TAETIGKEIT_LABEL ? taet : "AUSGABE" };
  }
  await db().update(staff).set({ dienstStandard: Object.keys(standard).length ? standard : null, updatedAt: new Date() }).where(eq(staff.id, staffId));
  await audit({ actorUserId: u.id, action: "staff.dienststandard", entityType: "staff", entityId: staffId, after: standard });
  revalidatePath(`/personal/${staffId}`); revalidatePath("/dienstplan");
}
