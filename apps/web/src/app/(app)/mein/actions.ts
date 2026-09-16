"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { abwesenheiten, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { heuteIso } from "@/lib/touren";

const str = (fd: FormData, k: string): string | null => { const v = String(fd.get(k) ?? "").trim(); return v || null; };
const datum = (v: string | null): string | null => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const alles = () => { for (const p of ["/mein", "/abwesenheiten", "/abwesenheiten/konto", "/touren"]) revalidatePath(p); };

/** Eigener Personal-Datensatz zum Login – ohne ihn gibt es keinen Selbstservice. */
async function eigenePerson() {
  const u = await requirePermission("self:view");
  const p = (await db().select({ id: staff.id }).from(staff).where(and(eq(staff.userId, u.id), eq(staff.isActive, true))).limit(1))[0];
  if (!p) throw new Error("Kein Personal-Datensatz mit diesem Login verknüpft.");
  return { u, staffId: p.id };
}

/** Urlaub oder Zeitausgleich beantragen – landet als BEANTRAGT beim Büro. */
export async function urlaubBeantragen(fd: FormData): Promise<void> {
  const { u, staffId } = await eigenePerson();
  const art = str(fd, "art") === "ZEITAUSGLEICH" ? "ZEITAUSGLEICH" : "URLAUB";
  const von = datum(str(fd, "von")); const bis = datum(str(fd, "bis")) ?? von;
  if (!von || !bis || bis < von) throw new Error("Zeitraum prüfen.");
  if (von < heuteIso()) throw new Error("Anträge nur für heute oder später – Vergangenes trägt das Büro ein.");
  const halbtag = fd.get("halbtag") === "on" && von === bis;
  const r = await db().insert(abwesenheiten).values({ staffId, art, von, bis, halbtag, notiz: str(fd, "notiz"), status: "BEANTRAGT", createdBy: u.id }).returning({ id: abwesenheiten.id });
  await audit({ actorUserId: u.id, action: "abwesenheit.antrag", entityType: "staff", entityId: staffId, after: { id: r[0]!.id, art, von, bis, halbtag } });
  alles();
}

/** Krankmeldung: ab heute (oder gestern), Ende offen oder bekannt – das Büro bestätigt und vermerkt die Bestätigung. */
export async function krankMelden(fd: FormData): Promise<void> {
  const { u, staffId } = await eigenePerson();
  const heute = heuteIso();
  const von = datum(str(fd, "von")) ?? heute;
  const bis = datum(str(fd, "bis")) ?? von;
  if (von > heute || bis < von) throw new Error("Zeitraum prüfen.");
  const gestern = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (von < gestern) throw new Error("Rückwirkend höchstens ab gestern – Älteres bitte dem Büro melden.");
  const r = await db().insert(abwesenheiten).values({ staffId, art: "KRANK", von, bis, notiz: str(fd, "notiz") ?? "Krankmeldung über Mein Bereich", status: "BEANTRAGT", createdBy: u.id }).returning({ id: abwesenheiten.id });
  await audit({ actorUserId: u.id, action: "abwesenheit.krankmeldung", entityType: "staff", entityId: staffId, after: { id: r[0]!.id, von, bis } });
  alles();
}

/** Eigenen, noch nicht entschiedenen Antrag zurückziehen. */
export async function antragZurueckziehen(fd: FormData): Promise<void> {
  const { u, staffId } = await eigenePerson();
  const id = String(fd.get("id") ?? "");
  const r = await db().delete(abwesenheiten).where(and(eq(abwesenheiten.id, id), eq(abwesenheiten.staffId, staffId), eq(abwesenheiten.status, "BEANTRAGT"))).returning({ id: abwesenheiten.id });
  if (r[0]) await audit({ actorUserId: u.id, action: "abwesenheit.zurueckgezogen", entityType: "abwesenheit", entityId: id });
  alles();
}
