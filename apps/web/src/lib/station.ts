import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { hash, verify } from "@node-rs/argon2";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { ausgabeSitzungen, distributions, geraetCodes, geraete, staff, timeEvents, zeitRegeln } from "@tdd/db";
import { db } from "./db";
import { currentTenantId } from "@tdd/db";
import { tokenAusCookie } from "./geraet";
import { audit } from "./audit";
import { statusFromLast, type EventKind } from "./zeit";

/**
 * Ausgabestation: der Laptop, der mit dem Team von Ausgabestelle zu Ausgabestelle wandert.
 * Gekoppelt wie das Fahrzeug-Tablet (Code, Token-Hash in der DB), aber ohne Fahrzeug- oder
 * Standortbindung – der Standort wird je Ausgabe-Sitzung gewaehlt. Personen melden sich mit
 * persoenlicher PIN an (argon2-Hash am Personal-Datensatz, 5 Fehlversuche = 15 Minuten Sperre).
 */
export const STATION_COOKIE = "tdd_station";
const STATION_MAX_AGE = 60 * 60 * 24 * 365;
export const STATION_USER_EMAIL = "ausgabestation@tdd.intern";
const PIN_MAX_FEHL = 5;
const PIN_SPERRE_MIN = 15;

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export interface Station { id: string; name: string; gekoppeltAt: Date }

export async function stationAusCookie(): Promise<Station | null> {
  const store = await cookies();
  const roh = tokenAusCookie(store.get(STATION_COOKIE)?.value);
  if (!roh) return null;
  const g = (await db().select({ id: geraete.id, name: geraete.name, gekoppeltAt: geraete.gekoppeltAt, zuletzt: geraete.zuletztGesehen })
    .from(geraete).where(and(eq(geraete.tokenHash, sha(roh)), eq(geraete.isActive, true), eq(geraete.art, "AUSGABE"))).limit(1))[0];
  if (!g) return null;
  if (!g.zuletzt || Date.now() - g.zuletzt.getTime() > 60_000) {
    await db().update(geraete).set({ zuletztGesehen: new Date() }).where(eq(geraete.id, g.id)).catch(() => undefined);
  }
  return { id: g.id, name: g.name, gekoppeltAt: g.gekoppeltAt };
}

/** Verwaltung: Kopplungscode fuer eine Ausgabestation (10 Minuten, einmal). */
export async function stationscodeErzeugen(name: string, userId: string): Promise<string> {
  await db().delete(geraetCodes).where(and(eq(geraetCodes.art, "AUSGABE"), isNull(geraetCodes.usedAt)));
  for (let i = 0; i < 5; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await db().insert(geraetCodes).values({ code, art: "AUSGABE", fahrzeugId: null, name, expiresAt: new Date(Date.now() + 10 * 60_000), createdBy: userId });
      return code;
    } catch { /* Code belegt – naechster Versuch */ }
  }
  throw new Error("Kein freier Code");
}

/** Laptop: Code einloesen, Stations-Token als Cookie setzen. */
export async function stationKoppeln(code: string, userAgent: string | null): Promise<Station | null> {
  const c = (await db().select().from(geraetCodes).where(and(eq(geraetCodes.code, code.trim()), eq(geraetCodes.art, "AUSGABE"), isNull(geraetCodes.usedAt), gt(geraetCodes.expiresAt, new Date()))).limit(1))[0];
  if (!c) return null;
  const token = randomBytes(32).toString("hex");
  const ins = await db().insert(geraete).values({ art: "AUSGABE", fahrzeugId: null, name: c.name, tokenHash: sha(token), userAgent: userAgent?.slice(0, 200) ?? null, gekoppeltBy: c.createdBy, zuletztGesehen: new Date() }).returning({ id: geraete.id, gekoppeltAt: geraete.gekoppeltAt });
  await db().update(geraetCodes).set({ usedAt: new Date() }).where(eq(geraetCodes.code, c.code));
  const store = await cookies();
  store.set(STATION_COOKIE, `${currentTenantId()}:${token}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: STATION_MAX_AGE });
  return { id: ins[0]!.id, name: c.name, gekoppeltAt: ins[0]!.gekoppeltAt };
}

export async function stationTrennen(id: string): Promise<void> {
  await db().update(geraete).set({ isActive: false }).where(and(eq(geraete.id, id), eq(geraete.art, "AUSGABE")));
}

// ── PIN ────────────────────────────────────────────────────────────────────

/** Einmal-PIN erzeugen (Verwaltung): 4 Ziffern, muss beim ersten Anmelden ersetzt werden. Rueckgabe nur einmal sichtbar. */
export async function einmalPinErzeugen(staffId: string): Promise<string> {
  const pin = String(randomInt(0, 10_000)).padStart(4, "0");
  await db().update(staff).set({ pinHash: await hash(pin), pinMussAendern: true, pinFehlversuche: 0, pinGesperrtBis: null, updatedAt: new Date() }).where(eq(staff.id, staffId));
  return pin;
}

export async function pinEntfernen(staffId: string): Promise<void> {
  await db().update(staff).set({ pinHash: null, pinMussAendern: false, pinFehlversuche: 0, pinGesperrtBis: null, updatedAt: new Date() }).where(eq(staff.id, staffId));
}

export type PinErgebnis = { ok: true; mussAendern: boolean } | { ok: false; error: string };

/** PIN pruefen mit Fehlversuchszaehler und Sperre. */
export async function pinPruefen(staffId: string, pin: string): Promise<PinErgebnis> {
  const s = (await db().select({ hash: staff.pinHash, muss: staff.pinMussAendern, fehl: staff.pinFehlversuche, bis: staff.pinGesperrtBis, aktiv: staff.isActive }).from(staff).where(eq(staff.id, staffId)).limit(1))[0];
  if (!s || !s.aktiv || !s.hash) return { ok: false, error: "Für diese Person ist keine PIN hinterlegt – bitte im Büro melden." };
  if (s.bis && s.bis > new Date()) return { ok: false, error: `Zu viele Fehlversuche – gesperrt bis ${s.bis.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vienna" })}.` };
  const ok = /^\d{4,8}$/.test(pin) && await verify(s.hash, pin).catch(() => false);
  if (!ok) {
    const fehl = s.fehl + 1; const sperren = fehl >= PIN_MAX_FEHL;
    await db().update(staff).set({ pinFehlversuche: sperren ? 0 : fehl, pinGesperrtBis: sperren ? new Date(Date.now() + PIN_SPERRE_MIN * 60_000) : null }).where(eq(staff.id, staffId));
    await audit({ action: sperren ? "station.pin.locked" : "station.pin.failed", entityType: "staff", entityId: staffId, staffId, after: { fehl } });
    return { ok: false, error: sperren ? `Fünf Fehlversuche – ${PIN_SPERRE_MIN} Minuten gesperrt.` : "PIN falsch." };
  }
  if (s.fehl) await db().update(staff).set({ pinFehlversuche: 0, pinGesperrtBis: null }).where(eq(staff.id, staffId));
  return { ok: true, mussAendern: s.muss };
}

/** Eigene PIN setzen (nach Einmal-PIN oder freiwillig). */
export async function pinSetzen(staffId: string, pin: string): Promise<string | null> {
  if (!/^\d{4,8}$/.test(pin)) return "PIN: 4 bis 8 Ziffern.";
  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) return "Bitte keine Reihen wie 1111 oder 1234.";
  await db().update(staff).set({ pinHash: await hash(pin), pinMussAendern: false, pinFehlversuche: 0, pinGesperrtBis: null, updatedAt: new Date() }).where(eq(staff.id, staffId));
  await audit({ action: "station.pin.set", entityType: "staff", entityId: staffId, staffId });
  return null;
}

// ── Sitzung ────────────────────────────────────────────────────────────────

async function stempelStatus(staffId: string) {
  const last = await db().select({ kind: timeEvents.kind }).from(timeEvents).where(eq(timeEvents.staffId, staffId)).orderBy(desc(timeEvents.at)).limit(1);
  return statusFromLast((last[0]?.kind ?? null) as EventKind | null);
}

/**
 * Sitzung eroeffnen. Offene Sitzungen derselben Station werden als "nicht ordentlich beendet"
 * geschlossen. Stempelt Kommen, wenn die Regel es vorsieht und die Person nicht schon eingestempelt ist.
 */
export async function sitzungStarten(p: { geraetId: string | null; locationId: number; staffId: string | null; userId: string | null }): Promise<{ id: string; kommen: boolean }> {
  if (p.geraetId) await sitzungenAutoSchliessen(eq(ausgabeSitzungen.geraetId, p.geraetId));
  if (p.staffId) await sitzungenAutoSchliessen(eq(ausgabeSitzungen.staffId, p.staffId));
  let kommen = false;
  if (p.staffId) {
    const regel = (await db().select({ st: zeitRegeln.ausgabeStempelt }).from(zeitRegeln).where(eq(zeitRegeln.tenantId, currentTenantId())).limit(1))[0];
    if ((regel?.st ?? true) && (await stempelStatus(p.staffId)) === "OUT") {
      await db().insert(timeEvents).values({ staffId: p.staffId, kind: "IN", source: "AUSGABE", createdBy: p.userId });
      kommen = true;
    }
  }
  const r = await db().insert(ausgabeSitzungen).values({ geraetId: p.geraetId, locationId: p.locationId, staffId: p.staffId, userId: p.userId, kommenGestempelt: kommen }).returning({ id: ausgabeSitzungen.id });
  await audit({ actorUserId: p.userId, action: "ausgabe.sitzung.start", entityType: "ausgabe_sitzung", entityId: r[0]!.id, staffId: p.staffId, after: { locationId: p.locationId, geraet: !!p.geraetId, kommen } });
  return { id: r[0]!.id, kommen };
}

async function sitzungenAutoSchliessen(where: ReturnType<typeof eq>): Promise<void> {
  const offen = await db().select({ id: ausgabeSitzungen.id }).from(ausgabeSitzungen).where(and(where, isNull(ausgabeSitzungen.ende)));
  for (const s of offen) await sitzungBeenden(s.id, { ordentlich: false });
}

export async function sitzungStand(id: string): Promise<{ anzahl: number; einnahmen: number; beginn: Date; locationId: number; staffId: string | null } | null> {
  const s = (await db().select().from(ausgabeSitzungen).where(eq(ausgabeSitzungen.id, id)).limit(1))[0];
  if (!s) return null;
  const agg = (await db().select({ n: sql<number>`count(*)::int`, sum: sql<string>`coalesce(sum(${distributions.amountPaid}), 0)` }).from(distributions).where(eq(distributions.sitzungId, id)))[0]!;
  return { anzahl: agg.n, einnahmen: Number(agg.sum), beginn: s.beginn, locationId: s.locationId, staffId: s.staffId };
}

/** Sitzung schliessen: Zahlen einfrieren, Kassenzaehlung/Differenz, optional Gehen stempeln. */
export async function sitzungBeenden(id: string, p: { ordentlich: boolean; kasseGezaehlt?: number | null; uebergabeAn?: string | null; notiz?: string | null; userId?: string | null }): Promise<void> {
  const s = (await db().select().from(ausgabeSitzungen).where(and(eq(ausgabeSitzungen.id, id), isNull(ausgabeSitzungen.ende))).limit(1))[0];
  if (!s) return;
  const stand = await sitzungStand(id);
  const soll = stand?.einnahmen ?? 0;
  const gezaehlt = p.kasseGezaehlt ?? null;
  await db().update(ausgabeSitzungen).set({
    ende: new Date(), ordentlich: p.ordentlich, ausgabenAnzahl: stand?.anzahl ?? 0, einnahmenSoll: soll.toFixed(2),
    kasseGezaehlt: gezaehlt != null ? gezaehlt.toFixed(2) : null, differenz: gezaehlt != null ? (gezaehlt - soll).toFixed(2) : null,
    uebergabeAn: p.uebergabeAn ?? null, notiz: p.notiz ?? null,
  }).where(eq(ausgabeSitzungen.id, id));
  if (s.kommenGestempelt && s.staffId && p.ordentlich && (await stempelStatus(s.staffId)) !== "OUT") {
    await db().insert(timeEvents).values({ staffId: s.staffId, kind: "OUT", source: "AUSGABE", createdBy: p.userId ?? null });
  }
  await audit({ actorUserId: p.userId ?? null, action: p.ordentlich ? "ausgabe.sitzung.ende" : "ausgabe.sitzung.auto", entityType: "ausgabe_sitzung", entityId: id, staffId: s.staffId, after: { anzahl: stand?.anzahl ?? 0, soll, gezaehlt } });
}
