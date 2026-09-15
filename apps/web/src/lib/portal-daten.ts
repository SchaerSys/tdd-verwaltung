import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { antraege, antragNachrichten } from "@tdd/db";
import { withOrg } from "./org";
import { ladeRueckstatus } from "./portal-status";
import type { PortalAntrag } from "./portal-kennzahlen";

export { portalKennzahlen, portalStatistik, type PortalAntrag, type PortalStatistik } from "./portal-kennzahlen";

/** Alle Antraege einer Organisation (RLS) samt Rueckkanal und ungelesenen TDD-Antworten. */
export async function ladePortalAntraege(orgId: number): Promise<PortalAntrag[]> {
  const rows = await withOrg(orgId, async (tx) => {
    const ungelesen = tx.select({ antragId: antragNachrichten.antragId, n: sql<number>`count(*)::int`.as("n") })
      .from(antragNachrichten)
      .where(and(eq(antragNachrichten.seite, "TDD"), isNull(antragNachrichten.gelesenAt)))
      .groupBy(antragNachrichten.antragId).as("ungelesen");
    return tx.select({
      id: antraege.id, firstName: antraege.firstName, lastName: antraege.lastName, birthDate: antraege.birthDate, city: antraege.city,
      status: antraege.status, targetType: antraege.targetType, createdAt: antraege.createdAt, decidedAt: antraege.decidedAt,
      transferredPersonId: antraege.transferredPersonId, vorgaengerAntragId: antraege.vorgaengerAntragId, consentGiven: antraege.consentGiven,
      intendedLocationId: antraege.intendedLocationId, adults: antraege.adults, childrenU12: antraege.childrenU12, childrenO12: antraege.childrenO12,
      neueAntworten: sql<number>`coalesce(${ungelesen.n}, 0)`,
    }).from(antraege).leftJoin(ungelesen, eq(ungelesen.antragId, antraege.id)).orderBy(desc(antraege.createdAt));
  });
  const rueck = await ladeRueckstatus(rows.map((r) => r.transferredPersonId).filter((x): x is string => !!x));
  return rows.map((r) => ({ ...r, neueAntworten: Number(r.neueAntworten), rueck: r.transferredPersonId ? (rueck.get(r.transferredPersonId) ?? null) : null }));
}

