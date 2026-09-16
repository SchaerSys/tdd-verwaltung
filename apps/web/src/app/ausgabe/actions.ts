"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { locations, staff, users } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ausgabeSession, getCurrentUser, logout, sessionMitAusgabe } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { pinPruefen, pinSetzen, sitzungBeenden, sitzungStarten, stationAusCookie, stationKoppeln, STATION_USER_EMAIL } from "@/lib/station";

export interface StationState { error?: string; ok?: boolean }

/** Laptop: 6-stelligen Code aus den Stammdaten einloesen. */
export async function stationKoppelnAction(_prev: StationState, fd: FormData): Promise<StationState> {
  const code = String(fd.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Bitte den 6-stelligen Code eingeben." };
  const ua = (await headers()).get("user-agent");
  const s = await stationKoppeln(code, ua);
  if (!s) return { error: "Code ungültig oder abgelaufen (10 Minuten). In den Stammdaten unter „Ausgabestation“ einen neuen Code erzeugen." };
  await audit({ action: "station.paired", entityType: "geraet", entityId: s.id, after: { name: s.name } });
  return { ok: true };
}

async function standortPruefen(locRaw: string): Promise<{ id: number; name: string } | null> {
  const id = parseInt(locRaw, 10);
  if (!Number.isFinite(id)) return null;
  const l = (await db().select({ id: locations.id, name: locations.name, aktiv: locations.isActive }).from(locations).where(eq(locations.id, id)).limit(1))[0];
  return l && l.aktiv ? { id: l.id, name: l.name } : null;
}

/**
 * Ausgabe starten – zwei Wege:
 *  Station (Laptop gekoppelt): Person + PIN -> Sitzung unter dem technischen Konto.
 *  Buero (eigenes Login mit Kassenrecht): Standort waehlen -> Sitzung unter dem eigenen Konto.
 */
export async function ausgabeStarten(_prev: StationState, fd: FormData): Promise<StationState> {
  const loc = await standortPruefen(String(fd.get("locationId") ?? ""));
  if (!loc) return { error: "Bitte eine Ausgabestelle wählen." };
  const station = await stationAusCookie();
  const user = await getCurrentUser();

  if (user && !station) {
    if (!hasPermission(user.role, "distribution:record")) return { error: "Keine Kassenberechtigung." };
    const sitz = await sitzungStarten({ geraetId: null, locationId: loc.id, staffId: user.staffId, userId: user.id });
    await sessionMitAusgabe(user.id, user.role, user.organizationId, { s: sitz.id, st: user.staffId, loc: loc.id, name: user.displayName });
    redirect("/kiosk");
  }
  if (!station) return { error: "Dieser Laptop ist nicht als Ausgabestation gekoppelt." };

  const staffId = String(fd.get("staffId") ?? ""); const pin = String(fd.get("pin") ?? "").trim();
  const p = (await db().select({ id: staff.id, first: staff.firstName, last: staff.lastName, aktiv: staff.isActive }).from(staff).where(eq(staff.id, staffId)).limit(1))[0];
  if (!p || !p.aktiv) return { error: "Person nicht gefunden." };
  const erg = await pinPruefen(p.id, pin);
  if (!erg.ok) return { error: erg.error };
  if (erg.mussAendern) {
    // Einmal-PIN: zuerst eigene PIN setzen, dann nochmal anmelden
    redirect(`/ausgabe/pin?staff=${p.id}&loc=${loc.id}`);
  }
  const konto = (await db().select({ id: users.id, role: users.role, org: users.organizationId, aktiv: users.isActive }).from(users).where(eq(users.email, STATION_USER_EMAIL)).limit(1))[0];
  if (!konto || !konto.aktiv) return { error: "Technisches Konto „Ausgabestation“ fehlt oder ist gesperrt – Betreiber informieren." };
  const sitz = await sitzungStarten({ geraetId: station.id, locationId: loc.id, staffId: p.id, userId: null });
  await sessionMitAusgabe(konto.id, konto.role, konto.org ?? null, { s: sitz.id, st: p.id, loc: loc.id, name: `${p.first} ${p.last}` });
  redirect("/kiosk");
}

/** Erste Anmeldung: Einmal-PIN durch eigene PIN ersetzen. */
export async function pinAendern(_prev: StationState, fd: FormData): Promise<StationState> {
  const station = await stationAusCookie();
  if (!station) return { error: "Nur an der Ausgabestation möglich." };
  const staffId = String(fd.get("staffId") ?? "");
  const alt = String(fd.get("alt") ?? "").trim(); const neu = String(fd.get("neu") ?? "").trim(); const neu2 = String(fd.get("neu2") ?? "").trim();
  if (neu !== neu2) return { error: "Die neue PIN stimmt nicht überein." };
  const erg = await pinPruefen(staffId, alt);
  if (!erg.ok) return { error: erg.error };
  const fehler = await pinSetzen(staffId, neu);
  if (fehler) return { error: fehler };
  return { ok: true };
}

/** Person wechseln: eigene Sitzung schliessen (ohne Kassenzaehlung), Station bleibt. Buero: zurueck ins Backoffice. */
export async function personWechseln(): Promise<void> {
  const user = await getCurrentUser();
  const az = await ausgabeSession();
  if (az) await sitzungBeenden(az.s, { ordentlich: true, userId: user?.email === STATION_USER_EMAIL ? null : user?.id ?? null });
  if (!user || user.email === STATION_USER_EMAIL) { await logout(); redirect("/ausgabe"); }
  await sessionMitAusgabe(user.id, user.role, user.organizationId, null);
  redirect("/dashboard");
}

/** Abschluss mit Kassenzaehlung und Uebergabe. */
export async function ausgabeBeenden(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  const az = await ausgabeSession();
  if (!user || !az) redirect("/ausgabe");
  const gez = String(fd.get("kasseGezaehlt") ?? "").trim().replace(",", ".");
  const kasse = gez === "" ? null : Number(gez);
  await sitzungBeenden(az.s, {
    ordentlich: true, kasseGezaehlt: kasse != null && Number.isFinite(kasse) ? kasse : null,
    uebergabeAn: String(fd.get("uebergabeAn") ?? "").trim() || null, notiz: String(fd.get("notiz") ?? "").trim() || null,
    userId: user.email === STATION_USER_EMAIL ? null : user.id,
  });
  if (user.email === STATION_USER_EMAIL) { await logout(); redirect("/ausgabe?beendet=1"); }
  await sessionMitAusgabe(user.id, user.role, user.organizationId, null);
  redirect("/ausgaben");
}
