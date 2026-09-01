"use server";

import { and, eq, ilike, isNull, or, desc, sql, inArray } from "drizzle-orm";
import { cards, persons, locations, distributions, personLocationAssignments } from "@tdd/db";
import { normalizeName } from "@tdd/core";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { ensureAusgabePlacement } from "@/lib/ausgabe";

export type EligStatus = "OK" | "EXPIRED" | "BLOCKED" | "REPLACED" | "NOTFOUND" | "NOCARD";

export interface Eligibility {
  status: EligStatus;
  cardId?: string;
  cardNumber?: string;
  personId?: string;
  name?: string;
  validTo?: string;
  reason?: string;
  // Tresen-Details (nur online befüllt):
  photoRef?: string | null;
  locationName?: string;
  lastVisit?: string | null; // ISO
  adults?: number;
  children?: number;
  amountDue?: number;   // heute fällig (Preis je Erwachsene/Kinder am Ort)
  debt?: number;        // offener Schuldenbetrag (> 0 = Person schuldet)
  familienNr?: number | null; // laufende Nummer je Ort
  gruppe?: number | null;     // abgeleitet aus familienNr + Gruppengröße
  note?: string | null;       // persistente Notiz (bleibt bei jedem Scan sichtbar)
  reissued?: boolean;         // Alt-Karte gescannt → neue EAN-Karte wurde erzeugt (bitte drucken)
  visitsToday?: number;       // Anzahl heutiger Ausgaben (Doppelausgabe-Warnung am Tresen)
}

/** Erwachsene = Haushalt gesamt − Kinder (mind. 1). */
function splitHousehold(householdSize: number | null, childrenCount: number | null) {
  const children = Math.max(0, childrenCount ?? 0);
  const adults = Math.max(1, (householdSize ?? children + 1) - children);
  return { adults, children };
}

/** Lädt Preis/Ort + Anwesenheits-/Schuldensaldo + Ort/Gruppe/Nummer/Notiz für den Tresen. */
async function tresenDetails(
  personId: string, locationId: number, householdSize: number | null, childrenCount: number | null,
  ausgabeNumber: number | null, gruppe: number | null, note: string | null,
) {
  const { adults, children } = splitHousehold(householdSize, childrenCount);
  const locRows = await db().select({ name: locations.name, pa: locations.priceAdult, pc: locations.priceChild })
    .from(locations).where(eq(locations.id, locationId)).limit(1);
  const loc = locRows[0];
  const priceAdult = Number(loc?.pa ?? 0);
  const priceChild = Number(loc?.pc ?? 0);
  const amountDue = Math.round((adults * priceAdult + children * priceChild) * 100) / 100;

  // Gruppe + Nummer sicherstellen, falls noch nicht vergeben.
  let familienNr = ausgabeNumber;
  let grp = gruppe;
  if (familienNr == null || grp == null) {
    const pl = await ensureAusgabePlacement(personId, locationId);
    familienNr = pl.nummer; grp = pl.gruppe;
  }

  const agg = await db().select({
    paid: sql<string>`COALESCE(SUM(${distributions.amountPaid}), 0)`,
    due: sql<string>`COALESCE(SUM(${distributions.amountDue}), 0)`,
    last: sql<string | null>`MAX(${distributions.distributedAt})`,
    today: sql<string>`COUNT(*) FILTER (WHERE (${distributions.distributedAt} AT TIME ZONE 'Europe/Vienna')::date = (now() AT TIME ZONE 'Europe/Vienna')::date)`,
  }).from(distributions).where(eq(distributions.personId, personId));
  const a = agg[0];
  // Saldo = bezahlt − fällig; negativ ⇒ Schulden. debt als positiver Betrag.
  const balance = Number(a?.paid ?? 0) - Number(a?.due ?? 0);
  const debt = balance < 0 ? Math.round(-balance * 100) / 100 : 0;

  return { adults, children, amountDue, debt, lastVisit: a?.last ?? null, locationName: loc?.name, familienNr, gruppe: grp, note, visitsToday: Number(a?.today ?? 0) };
}

async function guard() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "distribution:record")) throw new Error("Keine Berechtigung");
  return user;
}

/** Prüft eine gescannte Kartennummer auf Berechtigung/Gültigkeit. */
export async function lookupCard(rawCode: string): Promise<Eligibility> {
  const user = await guard();
  const code = rawCode.replace(/\s+/g, "").trim();
  if (!code) return { status: "NOTFOUND" };

  // Alt-Barcode = Familien-ID 6-stellig; auch „6732" → „006732" erkennen.
  const codeVariants = /^\d{1,6}$/.test(code) ? [code, code.padStart(6, "0")] : [code];

  const rows = await db()
    .select({
      cardId: cards.id, number: cards.cardNumber, status: cards.status, validTo: cards.validTo, blockReason: cards.blockReason,
      locationId: cards.locationId, legacy: cards.legacy,
      personId: persons.id, first: persons.firstName, last: persons.lastName,
      photoRef: persons.photoRef, householdSize: persons.householdSize, childrenCount: persons.childrenCount,
      ausgabeNumber: persons.ausgabeNumber, gruppe: persons.gruppe, note: persons.note,
    })
    .from(cards)
    .innerJoin(persons, eq(cards.personId, persons.id))
    .where(and(inArray(cards.cardNumber, codeVariants), isNull(cards.deletedAt)))
    .limit(1);

  const c = rows[0];
  if (!c) return { status: "NOTFOUND", cardNumber: code };

  const base = { cardId: c.cardId, cardNumber: c.number, personId: c.personId, name: `${c.first} ${c.last}`, validTo: c.validTo, photoRef: c.photoRef };
  const todayStr = new Date().toISOString().slice(0, 10);

  if (c.status === "GESPERRT") {
    const agg = await db().select({
      paid: sql<string>`COALESCE(SUM(${distributions.amountPaid}), 0)`,
      due: sql<string>`COALESCE(SUM(${distributions.amountDue}), 0)`,
    }).from(distributions).where(eq(distributions.personId, c.personId));
    const bal = Number(agg[0]?.paid ?? 0) - Number(agg[0]?.due ?? 0);
    const debt = bal < 0 ? Math.round(-bal * 100) / 100 : 0;
    return { ...base, status: "BLOCKED", reason: c.blockReason ?? "gesperrt", debt };
  }
  if (c.status === "ERSETZT") return { ...base, status: "REPLACED", reason: "Karte wurde ersetzt" };

  // Alt-Karte (legacy) am Tresen: automatisch neue EAN-Karte am Ort erzeugen, Alt-Karte ersetzen.
  if (c.legacy) {
    const { nextCardNumber, addMonths, today } = await import("@/lib/cards");
    const locRow = await db().select({ code: locations.locationCode }).from(locations).where(eq(locations.id, c.locationId)).limit(1);
    const validFrom = today();
    const validTo = c.validTo >= validFrom ? c.validTo : addMonths(validFrom, 6);
    const newNumber = await nextCardNumber(locRow[0]?.code ?? 0);
    const newIns = await db().insert(cards).values({
      cardNumber: newNumber, personId: c.personId, locationId: c.locationId,
      validFrom, validTo, status: "AKTIV", predecessorCardId: c.cardId, legacy: false, createdBy: user.id,
    }).returning({ id: cards.id });
    await db().update(cards).set({ status: "ERSETZT", updatedAt: new Date() }).where(eq(cards.id, c.cardId));
    await audit({ actorUserId: user.id, action: "card.reissue.legacy", entityType: "card", entityId: newIns[0]!.id, after: { from: c.number, to: newNumber } });
    const det = await tresenDetails(c.personId, c.locationId, c.householdSize, c.childrenCount, c.ausgabeNumber, c.gruppe, c.note);
    return { cardId: newIns[0]!.id, cardNumber: newNumber, personId: c.personId, name: `${c.first} ${c.last}`, validTo, photoRef: c.photoRef, status: "OK", reissued: true, ...det };
  }

  if (c.validTo < todayStr) return { ...base, status: "EXPIRED" };

  const det = await tresenDetails(c.personId, c.locationId, c.householdSize, c.childrenCount, c.ausgabeNumber, c.gruppe, c.note);
  return { ...base, status: "OK", ...det };
}

/** Suche ohne Karte: Personen nach Name, Adresse oder Telefon + deren aktuelle Karte. */
export async function searchByName(q: string): Promise<Eligibility[]> {
  await guard();
  const raw = (q ?? "").trim();
  if (raw.length < 2) return [];
  const n = `%${normalizeName(raw)}%`;
  const like = `%${raw}%`;
  const digits = raw.replace(/\D/g, "");

  const people = await db()
    .select({ id: persons.id, first: persons.firstName, last: persons.lastName })
    .from(persons)
    .where(and(
      isNull(persons.deletedAt),
      eq(persons.takeoverPending, false),
      eq(persons.status, "AKTIV"),
      or(
        ilike(persons.lastNameNorm, n),
        ilike(persons.firstNameNorm, n),
        ilike(persons.addressNorm, `%${normalizeName(raw)}%`),
        ilike(persons.address, like),
        digits.length >= 3 ? ilike(persons.phone, `%${digits}%`) : undefined,
      ),
    ))
    .orderBy(persons.lastName)
    .limit(10);

  const results: Eligibility[] = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const p of people) {
    // Nur echte, nicht im Papierkorb liegende Karten. Ohne solche Karte
    // erscheint die Person am Kiosk NICHT (gelöschte/kartenlose ausblenden).
    const card = await db()
      .select({ id: cards.id, number: cards.cardNumber, status: cards.status, validTo: cards.validTo })
      .from(cards).where(and(eq(cards.personId, p.id), isNull(cards.deletedAt))).orderBy(desc(cards.createdAt)).limit(1);
    const c = card[0];
    if (!c) continue;
    const name = `${p.first} ${p.last}`;
    const base = { cardId: c.id, cardNumber: c.number, personId: p.id, name, validTo: c.validTo };
    if (c.status === "GESPERRT") results.push({ ...base, status: "BLOCKED", reason: "gesperrt" });
    else if (c.status === "ERSETZT") results.push({ ...base, status: "REPLACED" });
    else if (c.validTo < todayStr) results.push({ ...base, status: "EXPIRED" });
    else results.push({ ...base, status: "OK" });
  }
  return results;
}

export interface RecordOpts {
  /** Heute fälliger Betrag (aus dem Preis am Ort). */
  amountDue?: number;
  /** "Geld vergessen": nichts bezahlt → Betrag wird zur Schuld. */
  moneyForgotten?: boolean;
  /** "Schulden beglichen": offene Schuld zusätzlich mitbezahlt. */
  settleDebt?: boolean;
  /** Persistente Notiz zur Person (überschreibt, wenn gesetzt). */
  note?: string | null;
}

/** Erfasst eine Ausgabe (idempotent über client_ref für den Offline-Puffer). */
export async function recordDistribution(cardId: string, clientRef: string, opts: RecordOpts = {}): Promise<{ ok: boolean; at: string }> {
  const user = await guard();
  const rows = await db().select({ personId: cards.personId, locationId: cards.locationId, householdSize: persons.householdSize, childrenCount: persons.childrenCount, ausgabeNumber: persons.ausgabeNumber, gruppe: persons.gruppe })
    .from(cards).innerJoin(persons, eq(cards.personId, persons.id)).where(eq(cards.id, cardId)).limit(1);
  const c = rows[0];
  if (!c) throw new Error("Karte nicht gefunden");

  const locationId = user.locationId ?? c.locationId;

  // Notiz persistieren (bleibt bei jedem Scan sichtbar).
  if (opts.note !== undefined) {
    await db().update(persons).set({ note: opts.note && opts.note.trim() !== "" ? opts.note.trim() : null }).where(eq(persons.id, c.personId));
  }

  // Beträge server-seitig (vertrauenswürdig) berechnen – Client-Werte nur als Hinweis.
  let amountDue: number | null = null;
  let amountPaid: number | null = null;
  if (opts.amountDue != null || opts.moneyForgotten || opts.settleDebt) {
    const det = await tresenDetails(c.personId, locationId, c.householdSize, c.childrenCount, c.ausgabeNumber, c.gruppe, null);
    amountDue = det.amountDue;
    if (opts.moneyForgotten) {
      amountPaid = 0; // heute nichts bezahlt → Schuld wächst um amountDue
    } else if (opts.settleDebt) {
      amountPaid = Math.round((det.amountDue + det.debt) * 100) / 100; // heute + offene Schuld
    } else {
      amountPaid = det.amountDue; // normal: fällig = bezahlt
    }
  }

  await db().insert(distributions).values({
    cardId, personId: c.personId, locationId, distributedBy: user.id, clientRef,
    amountDue: amountDue != null ? String(amountDue) : null,
    amountPaid: amountPaid != null ? String(amountPaid) : null,
  }).onConflictDoNothing({ target: distributions.clientRef });

  await audit({ actorUserId: user.id, action: "distribution.record", entityType: "distribution", entityId: cardId,
    after: amountDue != null ? { amountDue, amountPaid } : undefined });
  return { ok: true, at: new Date().toISOString() };
}

/** Begleicht die offenen Schulden einer Person (eigenes Log im Personendossier). */
export async function payDebt(cardId: string, clientRef: string): Promise<{ ok: boolean; settled: number }> {
  const user = await guard();
  const rows = await db().select({ personId: cards.personId, locationId: cards.locationId, householdSize: persons.householdSize, childrenCount: persons.childrenCount, ausgabeNumber: persons.ausgabeNumber, gruppe: persons.gruppe })
    .from(cards).innerJoin(persons, eq(cards.personId, persons.id)).where(eq(cards.id, cardId)).limit(1);
  const c = rows[0];
  if (!c) throw new Error("Karte nicht gefunden");
  const locationId = user.locationId ?? c.locationId;
  const det = await tresenDetails(c.personId, locationId, c.householdSize, c.childrenCount, c.ausgabeNumber, c.gruppe, null);
  if (det.debt <= 0) return { ok: true, settled: 0 };
  // Reine Schuldenzahlung: fällig 0, bezahlt = offene Schuld → Saldo ausgeglichen.
  await db().insert(distributions).values({
    cardId, personId: c.personId, locationId, distributedBy: user.id, clientRef,
    amountDue: "0", amountPaid: String(det.debt), note: "Schulden beglichen",
  }).onConflictDoNothing({ target: distributions.clientRef });
  await audit({ actorUserId: user.id, action: "distribution.debt_paid", entityType: "distribution", entityId: cardId, after: { settled: det.debt } });
  return { ok: true, settled: det.debt };
}

/** Sperrt die Karte einer Person direkt am Tresen (mit Grund). */
export async function blockCardKiosk(cardId: string, reason: string): Promise<{ ok: boolean }> {
  const user = await guard();
  const r = (reason ?? "").trim();
  await db().update(cards).set({ status: "GESPERRT", blockReason: r === "" ? "am Tresen gesperrt" : r.slice(0, 250), updatedAt: new Date() }).where(eq(cards.id, cardId));
  await audit({ actorUserId: user.id, action: "card.block.kiosk", entityType: "card", entityId: cardId, after: { reason: r } });
  return { ok: true };
}

/** Hebt eine Sperre am Tresen wieder auf. */
export async function unblockCardKiosk(cardId: string): Promise<{ ok: boolean }> {
  const user = await guard();
  await db().update(cards).set({ status: "AKTIV", blockReason: null, updatedAt: new Date() }).where(eq(cards.id, cardId));
  await audit({ actorUserId: user.id, action: "card.unblock.kiosk", entityType: "card", entityId: cardId });
  return { ok: true };
}

/** Speichert die persistente Notiz zur Person (Tresen). */
export async function savePersonNote(personId: string, note: string): Promise<{ ok: boolean }> {
  await guard();
  const clean = note.trim();
  await db().update(persons).set({ note: clean === "" ? null : clean }).where(eq(persons.id, personId));
  return { ok: true };
}

export interface IssueResult { ok: boolean; error?: string; cardId?: string; cardNumber?: string; name?: string; validTo?: string }

/** Neue Karte am Tresen ausstellen (Klient vor Ort, z. B. mit positivem Bescheid). */
export async function issueCardKiosk(personId: string, months = 6): Promise<IssueResult> {
  const user = await getCurrentUser();
  if (!user || !(hasPermission(user.role, "distribution:record") || hasPermission(user.role, "card:manage"))) {
    return { ok: false, error: "Keine Berechtigung" };
  }
  const { nextCardNumber, addMonths, today } = await import("@/lib/cards");
  const p = await db().select({ first: persons.firstName, last: persons.lastName }).from(persons).where(eq(persons.id, personId)).limit(1);
  if (!p[0]) return { ok: false, error: "Person nicht gefunden" };

  // Standort: aktive Zuordnung der Person, sonst Standort des Kiosk-Bedieners
  let loc = await db().select({ id: locations.id, code: locations.locationCode })
    .from(personLocationAssignments).innerJoin(locations, eq(personLocationAssignments.locationId, locations.id))
    .where(and(eq(personLocationAssignments.personId, personId), eq(personLocationAssignments.isActive, true))).limit(1);
  if (!loc[0]) {
    if (!user.locationId) return { ok: false, error: "Kein Standort – bitte im Backoffice zuordnen." };
    await db().insert(personLocationAssignments).values({ personId, locationId: user.locationId });
    loc = await db().select({ id: locations.id, code: locations.locationCode }).from(locations).where(eq(locations.id, user.locationId)).limit(1);
  }
  // Falls „Übernahme ausstehend": mit Kartenausstellung gilt die Person als übernommen
  await db().update(persons).set({ takeoverPending: false }).where(eq(persons.id, personId));
  // Laufende Nummer (= Familien-Nummer) am Ort sicherstellen.
  await ensureAusgabePlacement(personId, loc[0]!.id);

  const validFrom = today();
  const validTo = addMonths(validFrom, [3, 6, 12].includes(months) ? months : 6);
  const cardNumber = await nextCardNumber(loc[0]!.code);
  const ins = await db().insert(cards).values({
    cardNumber, personId, locationId: loc[0]!.id, validFrom, validTo, status: "AKTIV", createdBy: user.id,
  }).returning({ id: cards.id });

  await audit({ actorUserId: user.id, action: "card.issue.kiosk", entityType: "card", entityId: ins[0]!.id, after: { cardNumber } });
  return { ok: true, cardId: ins[0]!.id, cardNumber, name: `${p[0].first} ${p[0].last}`, validTo };
}

export interface CachedCard { cardNumber: string; name: string; validTo: string; status: string; cardId: string }

/** Aktive Karten eines Standorts – für den Offline-Cache am Tresen. */
export async function getActiveCards(): Promise<CachedCard[]> {
  const user = await guard();
  const locId = user.locationId;
  const rows = await db()
    .select({ cardId: cards.id, number: cards.cardNumber, status: cards.status, validTo: cards.validTo, first: persons.firstName, last: persons.lastName })
    .from(cards)
    .innerJoin(persons, eq(cards.personId, persons.id))
    .where(and(
      eq(cards.status, "AKTIV"),
      isNull(cards.deletedAt),
      isNull(persons.deletedAt),
      locId ? eq(cards.locationId, locId) : undefined,
    ))
    .limit(5000);
  return rows.map((r) => ({ cardNumber: r.number, name: `${r.first} ${r.last}`, validTo: r.validTo, status: r.status, cardId: r.cardId }));
}
