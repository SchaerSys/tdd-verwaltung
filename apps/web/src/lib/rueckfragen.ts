import { sql } from "drizzle-orm";
import { db } from "./db";

/** Zeile der Owner-View v_rueckfragen_tdd (Antraege mit Nachrichtenverlauf, TDD-Sicht). */
export interface RueckfrageFall {
  antragId: string; organizationId: number; orgName: string; orgType: string;
  firstName: string; lastName: string; birthDate: string | null; status: string;
  transferredPersonId: string | null; antragAm: Date; ungelesen: number; letzteAm: Date | null;
}

function rows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[];
}

const SPALTEN = sql`antrag_id AS "antragId", organization_id AS "organizationId", org_name AS "orgName", org_type AS "orgType",
  first_name AS "firstName", last_name AS "lastName", birth_date AS "birthDate", status, transferred_person_id AS "transferredPersonId",
  antrag_am AS "antragAm", ungelesen, letzte_am AS "letzteAm"`;

/** Alle Faelle mit Verlauf, unbeantwortete zuerst. */
export async function ladeRueckfragen(): Promise<RueckfrageFall[]> {
  const r = rows<RueckfrageFall>(await db().execute(sql`SELECT ${SPALTEN} FROM v_rueckfragen_tdd ORDER BY ungelesen DESC, letzte_am DESC NULLS LAST LIMIT 500`));
  return r.map(normalisiere);
}

export async function ladeRueckfrage(antragId: string): Promise<RueckfrageFall | undefined> {
  const r = rows<RueckfrageFall>(await db().execute(sql`SELECT ${SPALTEN} FROM v_rueckfragen_tdd WHERE antrag_id = ${antragId} LIMIT 1`));
  return r[0] ? normalisiere(r[0]) : undefined;
}

/** Anzahl unbeantworteter Rueckfragen (fuer Navigation/Dashboard). */
export async function offeneRueckfragen(): Promise<number> {
  const r = rows<{ n: unknown }>(await db().execute(sql`SELECT coalesce(sum(ungelesen), 0)::int AS n FROM v_rueckfragen_tdd`));
  return Number(r[0]?.n ?? 0);
}

function normalisiere(r: RueckfrageFall): RueckfrageFall {
  return {
    ...r, ungelesen: Number(r.ungelesen),
    antragAm: r.antragAm instanceof Date ? r.antragAm : new Date(String(r.antragAm)),
    letzteAm: r.letzteAm ? (r.letzteAm instanceof Date ? r.letzteAm : new Date(String(r.letzteAm))) : null,
    birthDate: r.birthDate ? String(r.birthDate).slice(0, 10) : null,
  };
}
