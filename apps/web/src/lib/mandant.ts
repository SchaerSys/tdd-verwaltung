import { cache } from "react";
import { eq } from "drizzle-orm";
import { tenants, currentTenantId } from "@tdd/db";
import { db } from "./db";

/**
 * Stammdaten des aktuellen Mandanten (Unternehmen) – Name, Anschrift, Kontakt fuer Drucke,
 * Datenschutzinformation und E-Mails (055). Gepflegt vom Betreiber in der Wartungsplattform.
 * Je Anfrage einmal geladen (React cache); Fallback, falls die Zeile fehlt (Tests, Altstand).
 */
export interface MandantStammdaten {
  id: string;
  name: string;
  kurzname: string;
  host: string | null;
  anschrift: string | null;
  vertretung: string | null;
  kontaktEmail: string | null;
  kontaktTelefon: string | null;
  website: string | null;
}

export const mandant = cache(async (): Promise<MandantStammdaten> => {
  const id = currentTenantId();
  const t = (await db().select().from(tenants).where(eq(tenants.id, id)).limit(1))[0];
  if (!t) return { id, name: "CareOS", kurzname: "CareOS", host: null, anschrift: null, vertretung: null, kontaktEmail: null, kontaktTelefon: null, website: null };
  return {
    id: t.id, name: t.name, kurzname: t.kurzname?.trim() || t.name, host: t.host, anschrift: t.anschrift, vertretung: t.vertretung,
    kontaktEmail: t.kontaktEmail, kontaktTelefon: t.kontaktTelefon, website: t.website,
  };
});

/** Anschrift als Zeilen (fuer Drucke/Datenschutzinfo). */
export function zeilen(text: string | null | undefined): string[] {
  return (text ?? "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
}
