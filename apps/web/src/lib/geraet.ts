import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { fahrzeuge, geraetCodes, geraete, currentTenantId } from "@tdd/db";
import { db } from "./db";

/** Cookie-Wert "<tenant>:<token>" (053) oder nur "<token>" (Altbestand = Standard-Mandant). */
export function tokenAusCookie(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.includes(":") ? v.slice(v.indexOf(":") + 1) : v;
  return t.length >= 32 ? t : null;
}

/**
 * Fahrzeug-Tablet: kein Benutzer-Login, sondern ein Geraete-Token im Cookie, das genau
 * einem Fahrzeug gehoert. Gekoppelt wird mit einem kurzlebigen Code aus der Disposition.
 * In der DB liegt nur der Hash – ein Datenbank-Auszug verraet kein Token.
 */
export const GERAET_COOKIE = "tdd_geraet";
const GERAET_MAX_AGE = 60 * 60 * 24 * 365; // ein Jahr; Trennen in der Disposition macht es ungueltig

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export interface Geraet { id: string; name: string; fahrzeugId: number; fahrzeug: string; kuehlung: boolean }

/** Das Geraet hinter dem Cookie – oder null. Merkt sich nebenbei „zuletzt gesehen“. */
export async function geraetAusCookie(): Promise<Geraet | null> {
  const store = await cookies();
  const roh = tokenAusCookie(store.get(GERAET_COOKIE)?.value);
  if (!roh) return null;
  const g = (await db().select({ id: geraete.id, name: geraete.name, fahrzeugId: geraete.fahrzeugId, kennzeichen: fahrzeuge.kennzeichen, bezeichnung: fahrzeuge.bezeichnung, kuehlung: fahrzeuge.kuehlung, zuletzt: geraete.zuletztGesehen })
    .from(geraete).innerJoin(fahrzeuge, eq(geraete.fahrzeugId, fahrzeuge.id))
    .where(and(eq(geraete.tokenHash, sha(roh)), eq(geraete.isActive, true), eq(geraete.art, "FAHRZEUG"))).limit(1))[0];
  if (!g || g.fahrzeugId == null) return null;
  if (!g.zuletzt || Date.now() - g.zuletzt.getTime() > 60_000) {
    await db().update(geraete).set({ zuletztGesehen: new Date() }).where(eq(geraete.id, g.id)).catch(() => undefined);
  }
  return { id: g.id, name: g.name, fahrzeugId: g.fahrzeugId, fahrzeug: `${g.kennzeichen} · ${g.bezeichnung}`, kuehlung: g.kuehlung };
}

/** Disposition: Kopplungscode fuer ein Fahrzeug erzeugen (10 Minuten, einmal verwendbar). */
export async function kopplungscodeErzeugen(fahrzeugId: number, name: string, userId: string): Promise<string> {
  // alte Codes des Fahrzeugs verfallen
  await db().delete(geraetCodes).where(eq(geraetCodes.fahrzeugId, fahrzeugId));
  for (let i = 0; i < 5; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await db().insert(geraetCodes).values({ code, fahrzeugId, name, expiresAt: new Date(Date.now() + 10 * 60_000), createdBy: userId });
      return code;
    } catch { /* Code schon vergeben – naechster Versuch */ }
  }
  throw new Error("Kein freier Code");
}

/** Tablet: Code einloesen, Geraete-Token als Cookie setzen. */
export async function koppeln(code: string, userAgent: string | null): Promise<Geraet | null> {
  const c = (await db().select().from(geraetCodes).where(and(eq(geraetCodes.code, code.trim()), isNull(geraetCodes.usedAt), gt(geraetCodes.expiresAt, new Date()), eq(geraetCodes.art, "FAHRZEUG"))).limit(1))[0];
  if (!c || c.fahrzeugId == null) return null;
  const token = randomBytes(32).toString("hex");
  const ins = await db().insert(geraete).values({ fahrzeugId: c.fahrzeugId, name: c.name, tokenHash: sha(token), userAgent: userAgent?.slice(0, 200) ?? null, gekoppeltBy: c.createdBy, zuletztGesehen: new Date() }).returning({ id: geraete.id });
  await db().update(geraetCodes).set({ usedAt: new Date() }).where(eq(geraetCodes.code, c.code));
  const store = await cookies();
  store.set(GERAET_COOKIE, `${currentTenantId()}:${token}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: GERAET_MAX_AGE });
  const fz = (await db().select({ kennzeichen: fahrzeuge.kennzeichen, bezeichnung: fahrzeuge.bezeichnung, kuehlung: fahrzeuge.kuehlung }).from(fahrzeuge).where(eq(fahrzeuge.id, c.fahrzeugId)).limit(1))[0]!;
  return { id: ins[0]!.id, name: c.name, fahrzeugId: c.fahrzeugId, fahrzeug: `${fz.kennzeichen} · ${fz.bezeichnung}`, kuehlung: fz.kuehlung };
}

export async function geraetTrennen(id: string): Promise<void> {
  await db().update(geraete).set({ isActive: false }).where(eq(geraete.id, id));
}
