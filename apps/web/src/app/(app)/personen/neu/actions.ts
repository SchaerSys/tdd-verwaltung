"use server";

import { persons, personLocationAssignments, duplicateDecisions } from "@tdd/db";
import { normalizeName, normalizeAddress, koelnerPhonetik, type PersonKey } from "@tdd/core";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { findCandidates, type Candidate } from "@/lib/dedupe";

export interface CreateState {
  error?: string;
  personId?: string;
  candidates?: Candidate[]; // HIGH-Treffer, die eine bewusste Entscheidung verlangen
}

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? null : str;
}
function toInt(v: string | null): number | null {
  if (v == null) return null;
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Gesamt-Haushalt aus Erwachsenen + Kindern; null wenn beides leer. */
function householdTotal(adults: number | null, children: number | null): number | null {
  if (adults == null && children == null) return null;
  return (adults ?? 0) + (children ?? 0);
}

export interface LiveInput {
  firstName: string; lastName: string; birthDate?: string | null;
  address?: string | null; postalCode?: string | null;
}

/** Live-Dublettensuche für das Neuaufnahme-Panel (unscharf). */
export async function searchCandidates(input: LiveInput): Promise<Candidate[]> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) return [];
  if (!input.lastName || input.lastName.trim().length < 2) return [];
  return findCandidates(input as PersonKey);
}

export async function createPerson(_prev: CreateState, fd: FormData): Promise<CreateState> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) return { error: "Keine Berechtigung" };

  const firstName = s(fd, "firstName");
  const lastName = s(fd, "lastName");
  if (!firstName || !lastName) return { error: "Vor- und Nachname sind Pflicht." };

  const address = s(fd, "address");
  const postalCode = s(fd, "postalCode");
  const birthDate = s(fd, "birthDate");
  const force = fd.get("force") === "1";
  const reason = s(fd, "reason");

  const input: PersonKey = { firstName, lastName, birthDate, address, postalCode };
  const candidates = await findCandidates(input);
  const high = candidates.filter((c) => c.band === "HIGH");

  // Ungezwungener Anlauf mit HIGH-Treffer → bewusste Entscheidung verlangen
  if (high.length > 0 && !force) {
    return { candidates: high };
  }

  const lastNameNorm = normalizeName(lastName);
  const firstNameNorm = normalizeName(firstName);
  const locationId = toInt(s(fd, "locationId"));

  const inserted = await db()
    .insert(persons)
    .values({
      firstName, lastName, address, postalCode,
      city: s(fd, "city"), birthDate, phone: s(fd, "phone"), email: s(fd, "email"),
      // "Erwachsene" wird eingegeben; gespeichert wird householdSize = Erwachsene + Kinder (Gesamt-Haushalt).
      householdSize: householdTotal(toInt(s(fd, "adults")), toInt(s(fd, "childrenCount"))),
      childrenCount: toInt(s(fd, "childrenCount")),
      languageId: toInt(s(fd, "languageId")), originId: toInt(s(fd, "originId")), note: s(fd, "note"),
      consentAt: fd.get("consent") ? new Date() : null,
      lastNameNorm, firstNameNorm, addressNorm: normalizeAddress(address),
      lastNamePhon: koelnerPhonetik(lastNameNorm), firstNamePhon: koelnerPhonetik(firstNameNorm),
      createdBy: user.id, updatedBy: user.id,
    })
    .returning({ id: persons.id });

  const personId = inserted[0]!.id;
  if (locationId) {
    await db().insert(personLocationAssignments).values({ personId, locationId });
    const { ensureAusgabePlacement } = await import("@/lib/ausgabe");
    await ensureAusgabePlacement(personId, locationId);
  }

  // Override protokollieren (Mensch legt trotz Treffer neu an)
  if (candidates.length > 0) {
    const top = candidates[0]!;
    await db().insert(duplicateDecisions).values({
      createdPersonId: personId,
      matchedPersonId: top.id,
      score: String(top.score),
      band: top.band === "NONE" ? null : top.band,
      shownCandidates: candidates.map((c) => ({ id: c.id, name: c.name, score: c.score, band: c.band, location: c.location })),
      decision: "CREATE_NEW",
      reason,
      decidedBy: user.id,
    });
  }

  await audit({
    actorUserId: user.id,
    action: candidates.length ? "person.create.override" : "person.create",
    entityType: "person", entityId: personId, after: { firstName, lastName, birthDate },
  });

  return { personId };
}
