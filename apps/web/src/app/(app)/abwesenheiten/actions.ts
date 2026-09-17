"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { abwesenheiten, staff } from "@tdd/db";
import { pushAnPersonal } from "@/lib/push";
import { fmtDate } from "@/lib/format";
import { ABW_ART_LABEL } from "@/lib/abwesenheit";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";

const ARTEN = ["URLAUB", "KRANK", "ZEITAUSGLEICH", "PFLEGE", "SONDERURLAUB", "UNBEZAHLT", "SONSTIG"];
const str = (fd: FormData, k: string): string | null => { const v = String(fd.get(k) ?? "").trim(); return v || null; };
const alles = () => { for (const p of ["/abwesenheiten", "/abwesenheiten/konto", "/touren", "/zeit/monat", "/zeit/pruefung"]) revalidatePath(p); };

/** Buero erfasst eine Abwesenheit (gilt als genehmigt) – oder traegt einen Antrag ein (status BEANTRAGT). */
export async function abwesenheitErfassen(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const staffId = str(fd, "staffId"); const art = str(fd, "art") ?? "SONSTIG";
  const von = str(fd, "von"); const bis = str(fd, "bis") ?? von;
  if (!staffId || !von || !bis || bis < von || !ARTEN.includes(art)) throw new Error("Person, Art und Zeitraum sind Pflicht.");
  const status = fd.get("status") === "BEANTRAGT" ? "BEANTRAGT" : "GENEHMIGT";
  const halbtag = fd.get("halbtag") === "on" && von === bis;
  const r = await db().insert(abwesenheiten).values({
    staffId, art, von, bis, notiz: str(fd, "notiz"), status, halbtag, bestaetigung: fd.get("bestaetigung") === "on",
    createdBy: u.id, entschiedenBy: status === "GENEHMIGT" ? u.id : null, entschiedenAt: status === "GENEHMIGT" ? new Date() : null,
  }).returning({ id: abwesenheiten.id });
  await audit({ actorUserId: u.id, action: "abwesenheit.create", entityType: "staff", entityId: staffId, after: { id: r[0]!.id, art, von, bis, status, halbtag } });
  alles();
}

export async function abwesenheitEntscheiden(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const id = String(fd.get("id") ?? ""); const status = String(fd.get("status")) === "ABGELEHNT" ? "ABGELEHNT" : "GENEHMIGT";
  const r = await db().update(abwesenheiten).set({ status, entschiedenBy: u.id, entschiedenAt: new Date() }).where(eq(abwesenheiten.id, id)).returning({ staffId: abwesenheiten.staffId, art: abwesenheiten.art, von: abwesenheiten.von, bis: abwesenheiten.bis });
  await audit({ actorUserId: u.id, action: status === "GENEHMIGT" ? "abwesenheit.approve" : "abwesenheit.reject", entityType: "abwesenheit", entityId: id });
  if (r[0]) void pushAnPersonal([r[0].staffId], { titel: status === "GENEHMIGT" ? "Antrag genehmigt" : "Antrag abgelehnt", text: `${ABW_ART_LABEL[r[0].art] ?? r[0].art} ${fmtDate(r[0].von)}${r[0].bis !== r[0].von ? ` – ${fmtDate(r[0].bis)}` : ""}`, url: "/my/antraege", tag: `antrag-${id}` });
  alles();
}

export async function abwesenheitBestaetigung(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const id = String(fd.get("id") ?? "");
  await db().update(abwesenheiten).set({ bestaetigung: true }).where(eq(abwesenheiten.id, id));
  await audit({ actorUserId: u.id, action: "abwesenheit.bestaetigung", entityType: "abwesenheit", entityId: id });
  alles();
}

export async function abwesenheitLoeschen(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const id = String(fd.get("id") ?? "");
  const alt = (await db().select().from(abwesenheiten).where(eq(abwesenheiten.id, id)).limit(1))[0];
  await db().delete(abwesenheiten).where(eq(abwesenheiten.id, id));
  await audit({ actorUserId: u.id, action: "abwesenheit.delete", entityType: "abwesenheit", entityId: id, before: alt ? { art: alt.art, von: alt.von, bis: alt.bis } : null });
  alles();
}

/** Urlaubs-Stammdaten am Personal (Urlaubsjahr, Wochen, Uebertrag-Startwert, Vordienstzeiten). */
export async function urlaubStammdaten(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const id = String(fd.get("staffId") ?? ""); if (!id) return;
  const wochen = Number(fd.get("urlaubWochen")) === 6 ? 6 : 5;
  const uebertrag = Number(String(fd.get("urlaubUebertragTage") ?? "0").replace(",", "."));
  const anrechnung = Number(String(fd.get("dienstjahreAnrechnung") ?? "0").replace(",", "."));
  await db().update(staff).set({
    urlaubsjahr: fd.get("urlaubsjahr") === "KALENDER" ? "KALENDER" : "ARBEIT", urlaubWochen: wochen,
    urlaubUebertragTage: String(Number.isFinite(uebertrag) ? uebertrag : 0), urlaubUebertragAb: str(fd, "urlaubUebertragAb"),
    dienstjahreAnrechnung: String(Number.isFinite(anrechnung) ? anrechnung : 0), updatedAt: new Date(),
  }).where(eq(staff.id, id));
  await audit({ actorUserId: u.id, action: "staff.urlaub", entityType: "staff", entityId: id, after: { wochen, uebertrag, anrechnung } });
  revalidatePath(`/personal/${id}`); revalidatePath("/abwesenheiten/konto");
}
