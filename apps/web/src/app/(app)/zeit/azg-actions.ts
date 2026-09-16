"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { betriebsfreieTage, staff, zeitAbschluesse, zeitRegeln } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { ladeMonat } from "@/lib/azg-daten";
import type { Verteilung } from "@/lib/azg";

const num = (fd: FormData, k: string, min: number, max: number, std: number) => { const n = Number(String(fd.get(k) ?? "").replace(",", ".")); return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : std; };

/** Grenzen/Zuschlaege – KV-abhaengig, deshalb einstellbar (nur Admin). */
export async function regelnSpeichern(fd: FormData): Promise<void> {
  const u = await requirePermission("admin:manage");
  const set = {
    maxTagMin: num(fd, "maxTagStd", 1, 12, 10) * 60, maxWocheMin: num(fd, "maxWocheStd", 1, 60, 50) * 60,
    pauseAbMin: num(fd, "pauseAbStd", 1, 12, 6) * 60, pauseMin: num(fd, "pauseMin", 0, 120, 30), ruhezeitMin: num(fd, "ruhezeitStd", 1, 24, 11) * 60,
    normalarbeitszeitWocheMin: num(fd, "normalStd", 1, 60, 40) * 60, mehrarbeitZuschlag: num(fd, "mehrarbeitZuschlag", 0, 100, 25), ueberstundenZuschlag: num(fd, "ueberstundenZuschlag", 0, 200, 50),
    kollektivvertrag: String(fd.get("kollektivvertrag") ?? "").trim() || null,
    arbeitgeberName: String(fd.get("arbeitgeberName") ?? "").trim() || "Tischlein deck dich Vorarlberg",
    arbeitgeberAnschrift: String(fd.get("arbeitgeberAnschrift") ?? "").trim() || null,
    bvKasse: String(fd.get("bvKasse") ?? "").trim() || null,
    svTraeger: String(fd.get("svTraeger") ?? "").trim() || "Österreichische Gesundheitskasse (ÖGK)",
    kvEinsicht: String(fd.get("kvEinsicht") ?? "").trim() || null,
    ausgabeStempelt: fd.get("ausgabeStempelt") === "on",
    // Zivildienst-Grenzen laut ZISA
    ziviWocheMinMin: num(fd, "ziviWocheMinStd", 0, 60, 36) * 60, ziviWocheMaxMin: num(fd, "ziviWocheMaxStd", 1, 60, 45) * 60,
    ziviTagMaxMin: num(fd, "ziviTagMaxStd", 1, 12, 10) * 60, ziviRuhezeitMin: num(fd, "ziviRuhezeitStd", 1, 24, 11) * 60,
    ziviPauseAbMin: num(fd, "ziviPauseAbStd", 1, 12, 6) * 60, ziviPauseMin: num(fd, "ziviPauseMin", 0, 120, 30),
    ziviFreistellungMonat: num(fd, "ziviFreistellungMonat", 0, 10, 2), ziviSonntagErlaubt: fd.get("ziviSonntagErlaubt") === "on",
    updatedAt: new Date(),
  };
  await db().insert(zeitRegeln).values({ id: 1, ...set }).onConflictDoUpdate({ target: zeitRegeln.id, set });
  await audit({ actorUserId: u.id, action: "zeit.regeln", entityType: "zeit_regeln", entityId: "1", after: set });
  revalidatePath("/zeit/regeln");
}

export async function betriebsfreiAnlegen(fd: FormData): Promise<void> {
  const u = await requirePermission("admin:manage");
  const datum = String(fd.get("datum") ?? ""); const name = String(fd.get("name") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !name) return;
  await db().insert(betriebsfreieTage).values({ datum, name, createdBy: u.id }).onConflictDoUpdate({ target: betriebsfreieTage.datum, set: { name } });
  await audit({ actorUserId: u.id, action: "zeit.betriebsfrei", entityType: "betriebsfrei", entityId: datum, after: { name } });
  revalidatePath("/zeit/regeln");
}
export async function betriebsfreiLoeschen(fd: FormData): Promise<void> {
  const u = await requirePermission("admin:manage");
  const datum = String(fd.get("datum") ?? "");
  await db().delete(betriebsfreieTage).where(eq(betriebsfreieTage.datum, datum));
  await audit({ actorUserId: u.id, action: "zeit.betriebsfrei.delete", entityType: "betriebsfrei", entityId: datum });
  revalidatePath("/zeit/regeln");
}

/** Wochenverteilung (Stunden je Wochentag) + Zeitkonto-Start am Personal-Datensatz. */
export async function verteilungSpeichern(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const id = String(fd.get("staffId") ?? ""); if (!id) return;
  const v: Verteilung = {};
  let summe = 0;
  for (let t = 1; t <= 7; t++) {
    const std = Number(String(fd.get(`tag${t}`) ?? "").replace(",", "."));
    const min = Number.isFinite(std) && std > 0 ? Math.round(std * 60) : 0;
    if (min > 0) v[String(t) as keyof Verteilung] = min;
    summe += min;
  }
  const start = String(fd.get("zeitkontoStart") ?? "") || null;
  const anfangStd = Number(String(fd.get("zeitkontoAnfang") ?? "0").replace(",", "."));
  await db().update(staff).set({
    sollVerteilung: summe > 0 ? v : null, weeklyHours: summe > 0 ? String(Math.round((summe / 60) * 100) / 100) : undefined,
    zeitkontoStart: start, zeitkontoAnfangMin: Number.isFinite(anfangStd) ? Math.round(anfangStd * 60) : 0, updatedAt: new Date(),
  }).where(eq(staff.id, id));
  await audit({ actorUserId: u.id, action: "staff.verteilung", entityType: "staff", entityId: id, after: { v, start, anfangStd } });
  revalidatePath(`/personal/${id}`); revalidatePath("/zeit");
}

/** Monat abschliessen: Werte einfrieren, Buchungen gesperrt (Nachweis § 26 AZG). */
export async function monatAbschliessen(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const staffId = String(fd.get("staffId") ?? ""); const jahr = Number(fd.get("jahr")); const monat = Number(fd.get("monat"));
  if (!staffId || !jahr || !monat) return;
  const [p] = await ladeMonat(jahr, monat, staffId);
  if (!p) return;
  const a = p.auswertung;
  if (a.tage.some((t) => t.offen)) throw new Error("Es gibt Tage ohne Ausstempeln – zuerst korrigieren.");
  await db().insert(zeitAbschluesse).values({
    staffId, jahr, monat, istMin: a.istMin, sollMin: a.sollMin, gutschriftMin: a.gutschriftMin, saldoMin: a.saldoMin, kontoMin: p.kontoMin,
    mehrarbeitMin: a.mehrarbeitMin, ueberstundenMin: a.ueberstundenMin, abgeschlossenBy: u.id,
  }).onConflictDoNothing();
  await audit({ actorUserId: u.id, action: "zeit.abschluss", entityType: "staff", entityId: staffId, after: { jahr, monat, saldo: a.saldoMin, konto: p.kontoMin } });
  revalidatePath("/zeit"); revalidatePath("/zeit/monat"); revalidatePath("/zeit/pruefung");
}

/** Nur Admin: Abschluss wieder oeffnen (z. B. nachtraegliche Korrektur). */
export async function monatOeffnen(fd: FormData): Promise<void> {
  const u = await requirePermission("admin:manage");
  const staffId = String(fd.get("staffId") ?? ""); const jahr = Number(fd.get("jahr")); const monat = Number(fd.get("monat"));
  await db().delete(zeitAbschluesse).where(and(eq(zeitAbschluesse.staffId, staffId), eq(zeitAbschluesse.jahr, jahr), eq(zeitAbschluesse.monat, monat)));
  await audit({ actorUserId: u.id, action: "zeit.abschluss.oeffnen", entityType: "staff", entityId: staffId, after: { jahr, monat } });
  revalidatePath("/zeit"); revalidatePath("/zeit/monat"); revalidatePath("/zeit/pruefung");
}
