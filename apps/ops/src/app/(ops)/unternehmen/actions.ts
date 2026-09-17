"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { tenants } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireOps } from "@/lib/auth";
import { mandantWaehlen } from "@/lib/tenant";

export type UnternehmenState = { error?: string; info?: string };

function rows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = res as { rows?: T[] };
  return r.rows ?? [];
}

/** Mandant anlegen: die DB-Funktion (Owner) legt Organisation, Zeitregeln, Fristen und Auswahllisten mit an (054). */
export async function mandantAnlegen(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireOps();
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
  if (!name) return { error: "Name ist Pflicht." };
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) return { error: "Kurzname: Kleinbuchstaben, Ziffern und Bindestrich, 2–61 Zeichen." };
  let id: string;
  try {
    const r = rows<{ id: string }>(await (await db()).execute(sql`SELECT ops_create_tenant(${name}, ${slug}) AS id`));
    id = r[0]!.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Anlegen fehlgeschlagen.";
    return { error: /tenants_slug_key|duplicate key/.test(msg) ? "Dieser Kurzname ist schon vergeben." : msg };
  }
  await audit({ akteur: ops.email, action: "tenant.create", entityType: "tenant", entityId: id, after: { name, slug } });
  revalidatePath("/unternehmen"); revalidatePath("/", "layout");
  return { info: `Mandant „${name}“ angelegt. Über „Benutzer“ kann jetzt das erste Admin-Konto eingeladen werden (Mandant oben auswählen).` };
}

/** Mandant aktiv/inaktiv – inaktive Mandanten werden von den Hintergrundjobs der Fach-App übersprungen. */
export async function mandantSchalten(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = String(fd.get("id") ?? "");
  const an = fd.get("aktiv") === "1";
  if (!id) return;
  await (await db()).update(tenants).set({ isActive: an }).where(eq(tenants.id, id));
  await audit({ akteur: ops.email, action: an ? "tenant.activate" : "tenant.deactivate", entityType: "tenant", entityId: id });
  revalidatePath("/unternehmen"); revalidatePath("/", "layout");
}

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Stammdaten (055): Host, Kurzname, Anschrift, Kontakt – erscheinen in Drucken, Datenschutzinfo und E-Mails der Fach-App. */
export async function stammdatenSpeichern(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireOps();
  const id = String(fd.get("id") ?? "");
  const t = (v: string) => { const s = String(fd.get(v) ?? "").trim(); return s ? s : null; };
  const name = t("name"); const host = t("host")?.toLowerCase() ?? null;
  if (!id || !name) return { error: "Name ist Pflicht." };
  if (host && !HOST.test(host)) return { error: "Host: nur Hostname ohne Protokoll und Pfad, z. B. tirol.careos.at." };
  const email = t("kontaktEmail");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Kontakt-E-Mail ist ungültig." };
  try {
    await (await db()).update(tenants).set({
      name, host, kurzname: t("kurzname"), anschrift: t("anschrift"), vertretung: t("vertretung"),
      kontaktEmail: email, kontaktTelefon: t("kontaktTelefon"), website: t("website"), updatedAt: new Date(),
    }).where(eq(tenants.id, id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Speichern fehlgeschlagen.";
    return { error: /uq_tenants_host/.test(msg) ? "Dieser Host ist schon einem anderen Mandanten zugeordnet." : msg };
  }
  await audit({ akteur: ops.email, action: "tenant.update", entityType: "tenant", entityId: id, after: { name, host } });
  revalidatePath(`/unternehmen/${id}`); revalidatePath("/unternehmen"); revalidatePath("/", "layout");
  return { info: "Stammdaten gespeichert. Die Fach-App übernimmt den Host innerhalb einer Minute." };
}

/** Mandant im Kopf der Wartungsplattform waehlen (Cookie, steuert den DB-Kontext aller Seiten). */
export async function mandantSetzen(fd: FormData): Promise<void> {
  await requireOps();
  await mandantWaehlen(String(fd.get("mandant") ?? ""));
  revalidatePath("/", "layout");
}
