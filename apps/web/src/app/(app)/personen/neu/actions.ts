"use server";

import { persons, personLocationAssignments, duplicateDecisions } from "@tdd/db";
import { normalizeName, normalizeAddress, koelnerPhonetik, type PersonKey } from "@tdd/core";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { tryPermission } from "@/lib/guard";
import { findCandidates, type Candidate } from "@/lib/dedupe";
import { parseForm, personSchema, text } from "@/lib/forms";
import { unterschriftSpeichern } from "@/lib/einwilligung";

export interface CreateState {
  error?: string;
  personId?: string;
  candidates?: Candidate[]; // HIGH-Treffer, die eine bewusste Entscheidung verlangen
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
  const user = await tryPermission("person:write");
  if (!user) return [];
  if (!input.lastName || input.lastName.trim().length < 2) return [];
  return findCandidates(input);
}

export async function createPerson(_prev: CreateState, fd: FormData): Promise<CreateState> {
  const user = await tryPermission("person:write");
  if (!user) return { error: "Keine Berechtigung" };

  const geprueft = parseForm(personSchema, fd);
  if (!geprueft.ok) return { error: "Vor- und Nachname sind Pflicht." };
  const { firstName, lastName, address, postalCode, birthDate } = geprueft.data;
  const force = fd.get("force") === "1";
  const reason = text.parse(fd.get("reason"));

  const input: PersonKey = { firstName, lastName, birthDate, address, postalCode };
  const candidates = await findCandidates(input);
  const high = candidates.filter((c) => c.band === "HIGH");

  // Ungezwungener Anlauf mit HIGH-Treffer → bewusste Entscheidung verlangen
  if (high.length > 0 && !force) {
    return { candidates: high };
  }

  const lastNameNorm = normalizeName(lastName);
  const firstNameNorm = normalizeName(firstName);
  const locationId = geprueft.data.locationId;

  const unterschriftRef = await unterschriftSpeichern(String(fd.get("unterschrift") ?? ""));
  const inserted = await db()
    .insert(persons)
    .values({
      firstName, lastName, address, postalCode,
      city: geprueft.data.city, birthDate, phone: geprueft.data.phone, email: geprueft.data.email,
      // "Erwachsene" wird eingegeben; gespeichert wird householdSize = Erwachsene + Kinder (Gesamt-Haushalt).
      householdSize: householdTotal(geprueft.data.adults, geprueft.data.childrenCount),
      childrenCount: geprueft.data.childrenCount,
      languageId: geprueft.data.languageId, originId: geprueft.data.originId, note: geprueft.data.note,
      consentAt: fd.get("consent") || unterschriftRef ? new Date() : null,
      consentMethod: unterschriftRef ? "UNTERSCHRIFT" : fd.get("consent") ? "PAPIER" : null, consentSignatureRef: unterschriftRef,
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
