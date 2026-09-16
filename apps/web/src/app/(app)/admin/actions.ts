"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { users, locations, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { sendMail } from "@/lib/mail";
import { appUrl } from "@/lib/auth-tokens";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { WEEKDAYS } from "@/lib/opening-hours";

const INTERNAL_ROLES = ["ADMIN", "ERFASSUNG", "AUSGABE", "AUSWERTUNG", "FAHRER"] as const;

export interface UserState { ok?: boolean; error?: string; angelegt?: string }

/** Legt einen internen TDD-Benutzer an (Zivildiener, Fahrer etc.) mit gewählter Rolle – mit Rueckmeldung. */
export async function createUser(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requirePermission("admin:manage");
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const pw = String(formData.get("password") ?? "");
  const locRaw = formData.get("locationId");
  const locationId = locRaw && String(locRaw) !== "" ? parseInt(String(locRaw), 10) : null;
  if (!email || !displayName) return { error: "Name und E-Mail sind Pflicht." };
  if (!(INTERNAL_ROLES as readonly string[]).includes(role)) return { error: "Ungültige Rolle." };
  if (pw.length < MIN_PASSWORD_LENGTH) return { error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.` };

  const exists = await db().select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
  if (exists[0]) return { error: `Diese E-Mail-Adresse hat schon ein Konto (Rolle ${exists[0].role}). Jede Person braucht eine eigene Adresse – oder die Rolle des bestehenden Kontos ändern.` };

  const ins = await db().insert(users).values({
    email, passwordHash: await hash(pw), displayName, role, locationId, isActive: true, emailVerified: true,
  }).returning({ id: users.id });
  await audit({ actorUserId: admin.id, action: "user.create", entityType: "user", entityId: email, after: { role, locationId } });

  // Fahrer:in: gleich im Personal-Verzeichnis anlegen (oder gleichnamigen Datensatz verknuepfen),
  // damit die Person sofort in der Disposition waehlbar ist und ihre Tour am Handy sieht.
  let hinweis = "";
  if (role === "FAHRER" && ins[0]) {
    const teile = displayName.split(/\s+/);
    const firstName = teile.length > 1 ? teile.slice(0, -1).join(" ") : displayName;
    const lastName = teile.length > 1 ? teile[teile.length - 1]! : "";
    const vorhanden = (await db().select({ id: staff.id, userId: staff.userId }).from(staff)
      .where(sql`lower(${staff.firstName}) = lower(${firstName}) AND lower(${staff.lastName}) = lower(${lastName}) AND ${staff.isActive}`).limit(1))[0];
    if (vorhanden && !vorhanden.userId) {
      await db().update(staff).set({ userId: ins[0].id, kannFahren: true, updatedAt: new Date() }).where(eq(staff.id, vorhanden.id));
      hinweis = " – mit dem bestehenden Personal-Datensatz verknüpft, in der Disposition wählbar.";
    } else if (!vorhanden) {
      await db().insert(staff).values({ firstName, lastName: lastName || "–", staffType: "FAHRER", kannFahren: true, userId: ins[0].id, email, locationId });
      hinweis = " – Personal-Datensatz (Fahrer:in) angelegt, in der Disposition wählbar.";
    } else {
      hinweis = " – ein gleichnamiger Personal-Datensatz ist schon mit einem anderen Login verknüpft; bitte im Personal prüfen.";
    }
  }
  revalidatePath("/admin"); revalidatePath("/admin/benutzer"); revalidatePath("/personal"); revalidatePath("/touren");
  return { ok: true, angelegt: `${displayName} (${email}, ${role})${hinweis}` };
}

/** Ändert die Rolle eines Benutzers. */
export async function setUserRole(formData: FormData): Promise<void> {
  const admin = await requirePermission("admin:manage");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || !(INTERNAL_ROLES as readonly string[]).includes(role)) { revalidatePath("/admin"); return; }
  if (userId === admin.id) { revalidatePath("/admin"); return; } // eigene Rolle nicht ändern
  await db().update(users).set({ role }).where(eq(users.id, userId));
  await audit({ actorUserId: admin.id, action: "user.role", entityType: "user", entityId: userId, after: { role } });
  revalidatePath("/admin");
}

/** Aktiviert/sperrt einen Benutzer. */
export async function toggleUserActive(formData: FormData): Promise<void> {
  const admin = await requirePermission("admin:manage");
  const userId = String(formData.get("userId") ?? "");
  const active = String(formData.get("active") ?? "") === "1";
  if (!userId || userId === admin.id) { revalidatePath("/admin"); return; }
  await db().update(users).set({ isActive: active }).where(eq(users.id, userId));
  await audit({ actorUserId: admin.id, action: active ? "user.activate" : "user.deactivate", entityType: "user", entityId: userId });
  revalidatePath("/admin");
}

/** Gibt eine bestätigte Registrierung frei (Login danach möglich). */
export async function approveUser(formData: FormData): Promise<void> {
  const admin = await requirePermission("admin:manage");
  const userId = String(formData.get("userId") ?? "");
  const rows = await db().select({ email: users.email, name: users.displayName, active: users.isActive }).from(users).where(eq(users.id, userId)).limit(1);
  const u = rows[0];
  if (!u || u.active) { revalidatePath("/admin"); return; }

  await db().update(users).set({ isActive: true }).where(eq(users.id, userId));
  await sendMail({ to: u.email, subject: "TDD-Verwaltung – Zugang freigegeben",
    text: `Guten Tag ${u.name},\n\nIhr Zugang wurde freigegeben. Sie können sich jetzt anmelden:\n${appUrl()}/login\n\nFreundliche Grüße\nTischlein deck dich` });
  await audit({ actorUserId: admin.id, action: "user.approve", entityType: "user", entityId: userId });
  revalidatePath("/admin");
}

/** Lehnt eine Registrierung ab (Konto wird entfernt). */
export async function rejectUser(formData: FormData): Promise<void> {
  const admin = await requirePermission("admin:manage");
  const userId = String(formData.get("userId") ?? "");
  // Nur nicht-aktive (ausstehende) Registrierungen dürfen gelöscht werden
  const rows = await db().select({ active: users.isActive }).from(users).where(eq(users.id, userId)).limit(1);
  if (!rows[0] || rows[0].active) { revalidatePath("/admin"); return; }
  await db().delete(users).where(eq(users.id, userId));
  await audit({ actorUserId: admin.id, action: "user.reject", entityType: "user", entityId: userId });
  revalidatePath("/admin");
}

/** Setzt die Preisregel (Betrag je Erwachsener/Kind) einer Ausgabestelle. */
export async function setLocationPrice(formData: FormData): Promise<void> {
  const admin = await requirePermission("admin:manage");
  const locId = parseInt(String(formData.get("locationId") ?? ""), 10);
  const parse = (v: FormDataEntryValue | null) => {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  };
  const pa = parse(formData.get("priceAdult"));
  const pc = parse(formData.get("priceChild"));
  const gcRaw = parseInt(String(formData.get("groupCount") ?? ""), 10);
  const gc = Number.isFinite(gcRaw) && gcRaw >= 1 && gcRaw <= 99 ? gcRaw : null;
  if (!locId || pa == null || pc == null) { revalidatePath("/admin"); return; }
  await db().update(locations).set({ priceAdult: String(pa), priceChild: String(pc), ...(gc != null ? { groupCount: gc } : {}) }).where(eq(locations.id, locId));
  await audit({ actorUserId: admin.id, action: "location.price", entityType: "location", entityId: String(locId), after: { priceAdult: pa, priceChild: pc, groupCount: gc } });
  revalidatePath("/admin");
}

/** Setzt die Öffnungszeiten (ein Zeitfenster je Wochentag) eines Standorts. */
export async function setLocationHours(formData: FormData): Promise<void> {
  const admin = await requirePermission("admin:manage");
  const locId = parseInt(String(formData.get("locationId") ?? ""), 10);
  if (!locId) { revalidatePath("/admin"); return; }

  const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const oh: Record<string, { from: string; to: string }[]> = {};
  for (const d of WEEKDAYS) {
    const f = String(formData.get(`${d}_from`) ?? "").trim();
    const t = String(formData.get(`${d}_to`) ?? "").trim();
    if (hm.test(f) && hm.test(t) && f < t) oh[d] = [{ from: f, to: t }];
  }
  const value = Object.keys(oh).length ? oh : null;
  await db().update(locations).set({ openingHours: value }).where(eq(locations.id, locId));
  await audit({ actorUserId: admin.id, action: "location.hours", entityType: "location", entityId: String(locId), after: value });
  revalidatePath("/admin");
}

/**
 * Setzt den zweiten Faktor eines anderen Benutzers zurueck – fuer den Fall, dass das
 * Geraet mit der Authenticator-App weg ist und keine Wiederherstellungscodes mehr da sind.
 * Das eigene Konto ist ausgenommen; dort geht es nur ueber Konto mit gueltigem Code.
 */
export async function resetUserTotp(formData: FormData): Promise<void> {
  const admin = await requirePermission("admin:manage");
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === admin.id) { revalidatePath("/admin/benutzer"); return; }
  await db().update(users).set({ totpEnabled: false, totpSecret: null, totpRecovery: [], totpLastWindow: null }).where(eq(users.id, userId));
  await audit({ actorUserId: admin.id, action: "user.2fa.reset", entityType: "user", entityId: userId });
  revalidatePath("/admin/benutzer");
}

// ── Standorte anlegen, bearbeiten, deaktivieren, loeschen ─────────────────

export interface LocationState { ok: boolean; error?: string }

function textFeld(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/** Neuen Standort anlegen. Kennung 0–999, eindeutig; sie steckt spaeter in jeder EAN-Karte. */
export async function createLocation(_prev: LocationState, formData: FormData): Promise<LocationState> {
  const admin = await requirePermission("admin:manage");
  const name = textFeld(formData, "name");
  const city = textFeld(formData, "city");
  const typRoh = textFeld(formData, "type"); const type = typRoh === "LADEN" || typRoh === "LAGER" ? typRoh : "AUSGABESTELLE";
  const code = parseInt(textFeld(formData, "locationCode"), 10);
  if (!name || !city) return { ok: false, error: "Name und Ort sind Pflicht." };
  if (!Number.isInteger(code) || code < 0 || code > 999) return { ok: false, error: "Die Kennung muss eine Zahl von 0 bis 999 sein." };

  const belegt = await db().select({ id: locations.id, name: locations.name, code: locations.locationCode }).from(locations)
    .where(sql`${locations.name} = ${name} OR ${locations.locationCode} = ${code}`).limit(1);
  if (belegt[0]) {
    return { ok: false, error: belegt[0].name === name ? "Ein Standort mit diesem Namen existiert schon." : `Die Kennung ${code} ist schon vergeben (${belegt[0].name}).` };
  }
  const ins = await db().insert(locations).values({ name, city, type, locationCode: code }).returning({ id: locations.id });
  await audit({ actorUserId: admin.id, action: "location.create", entityType: "location", entityId: String(ins[0]!.id), after: { name, city, type, code } });
  revalidatePath("/admin");
  return { ok: true };
}

/** Name, Ort und Typ aendern. Die Kennung bleibt, sobald Karten darauf ausgestellt sind. */
export async function updateLocation(_prev: LocationState, formData: FormData): Promise<LocationState> {
  const admin = await requirePermission("admin:manage");
  const id = parseInt(textFeld(formData, "locationId"), 10);
  const name = textFeld(formData, "name");
  const city = textFeld(formData, "city");
  const typRoh = textFeld(formData, "type"); const type = typRoh === "LADEN" || typRoh === "LAGER" ? typRoh : "AUSGABESTELLE";
  const codeRaw = textFeld(formData, "locationCode");
  if (!id || !name || !city) return { ok: false, error: "Name und Ort sind Pflicht." };

  const vorher = await db().select().from(locations).where(eq(locations.id, id)).limit(1);
  const alt = vorher[0];
  if (!alt) return { ok: false, error: "Standort nicht gefunden." };

  const patch: Partial<typeof locations.$inferInsert> = { name, city, type };
  if (codeRaw !== "" && parseInt(codeRaw, 10) !== alt.locationCode) {
    const code = parseInt(codeRaw, 10);
    if (!Number.isInteger(code) || code < 0 || code > 999) return { ok: false, error: "Die Kennung muss eine Zahl von 0 bis 999 sein." };
    const karten = await db().execute(sql`SELECT count(*)::int AS n FROM cards WHERE location_id = ${id}`);
    if (Number((karten as unknown as { n: number }[])[0]?.n) > 0) {
      return { ok: false, error: "Die Kennung kann nicht mehr geaendert werden: sie steckt in bereits ausgestellten Karten." };
    }
    const belegt = await db().select({ id: locations.id }).from(locations).where(eq(locations.locationCode, code)).limit(1);
    if (belegt[0] && belegt[0].id !== id) return { ok: false, error: `Die Kennung ${code} ist schon vergeben.` };
    patch.locationCode = code;
  }
  const gleich = await db().select({ id: locations.id }).from(locations).where(eq(locations.name, name)).limit(1);
  if (gleich[0] && gleich[0].id !== id) return { ok: false, error: "Ein anderer Standort traegt diesen Namen schon." };

  await db().update(locations).set(patch).where(eq(locations.id, id));
  await audit({ actorUserId: admin.id, action: "location.update", entityType: "location", entityId: String(id),
    before: { name: alt.name, city: alt.city, type: alt.type, code: alt.locationCode }, after: patch });
  revalidatePath("/admin");
  return { ok: true };
}

/** Deaktivieren nimmt den Standort aus allen Auswahlen, laesst aber alles Bestehende unberuehrt. */
export async function toggleLocationActive(formData: FormData): Promise<void> {
  const admin = await requirePermission("admin:manage");
  const id = parseInt(textFeld(formData, "locationId"), 10);
  const active = textFeld(formData, "active") === "1";
  if (!id) { revalidatePath("/admin"); return; }
  await db().update(locations).set({ isActive: active }).where(eq(locations.id, id));
  await audit({ actorUserId: admin.id, action: active ? "location.activate" : "location.deactivate", entityType: "location", entityId: String(id) });
  revalidatePath("/admin");
}

/**
 * Loeschen nur, wenn nichts darauf zeigt: keine Personen zugeordnet, keine Karten,
 * keine Ausgaben, kein Personal, keine Antraege. Sonst: deaktivieren.
 */
export async function deleteLocation(_prev: LocationState, formData: FormData): Promise<LocationState> {
  const admin = await requirePermission("admin:manage");
  const id = parseInt(textFeld(formData, "locationId"), 10);
  if (!id) return { ok: false, error: "Standort fehlt." };
  const ref = await db().execute(sql`
    SELECT
      (SELECT count(*) FROM person_location_assignments WHERE location_id = ${id})::int AS personen,
      (SELECT count(*) FROM cards WHERE location_id = ${id})::int AS karten,
      (SELECT count(*) FROM distributions WHERE location_id = ${id})::int AS ausgaben,
      (SELECT count(*) FROM staff WHERE location_id = ${id})::int AS personal,
      (SELECT count(*) FROM users WHERE location_id = ${id})::int AS benutzer`);
  const r = (ref as unknown as { personen: number; karten: number; ausgaben: number; personal: number; benutzer: number }[])[0]!;
  const gruende: string[] = [];
  if (r.personen) gruende.push(`${r.personen} zugeordnete Personen`);
  if (r.karten) gruende.push(`${r.karten} Karten`);
  if (r.ausgaben) gruende.push(`${r.ausgaben} Ausgaben`);
  if (r.personal) gruende.push(`${r.personal} Mitarbeitende`);
  if (r.benutzer) gruende.push(`${r.benutzer} Benutzerkonten`);
  if (gruende.length) return { ok: false, error: `Nicht loeschbar, es haengen daran: ${gruende.join(", ")}. Stattdessen deaktivieren.` };

  const alt = await db().select({ name: locations.name }).from(locations).where(eq(locations.id, id)).limit(1);
  await db().delete(locations).where(eq(locations.id, id));
  await audit({ actorUserId: admin.id, action: "location.delete", entityType: "location", entityId: String(id), before: { name: alt[0]?.name } });
  revalidatePath("/admin");
  return { ok: true };
}
