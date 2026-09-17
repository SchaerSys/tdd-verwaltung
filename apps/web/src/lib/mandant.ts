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
  /** Module je Mandant (057): fehlend = an, false = aus. */
  module: Record<string, boolean>;
  plan: string;
  testBis: string | null;
  slug: string;
}

export const mandant = cache(async (): Promise<MandantStammdaten> => {
  const id = currentTenantId();
  // Nur die fuer tdd_app freigegebenen Spalten (057: Betreiber-Notizen/Vertragsdetails sind nicht lesbar)
  const t = (await db().select({
    id: tenants.id, name: tenants.name, slug: tenants.slug, kurzname: tenants.kurzname, host: tenants.host, anschrift: tenants.anschrift, vertretung: tenants.vertretung,
    kontaktEmail: tenants.kontaktEmail, kontaktTelefon: tenants.kontaktTelefon, website: tenants.website, module: tenants.module, plan: tenants.plan, testBis: tenants.testBis,
  }).from(tenants).where(eq(tenants.id, id)).limit(1))[0];
  if (!t) return { id, name: "CareOS", kurzname: "CareOS", host: null, anschrift: null, vertretung: null, kontaktEmail: null, kontaktTelefon: null, website: null, module: {}, plan: "BASIS", testBis: null, slug: "" };
  return {
    id: t.id, name: t.name, kurzname: t.kurzname?.trim() || t.name, host: t.host, anschrift: t.anschrift, vertretung: t.vertretung,
    kontaktEmail: t.kontaktEmail, kontaktTelefon: t.kontaktTelefon, website: t.website, module: t.module ?? {}, plan: t.plan, testBis: t.testBis, slug: t.slug,
  };
});

/** Anschrift als Zeilen (fuer Drucke/Datenschutzinfo). */
export function zeilen(text: string | null | undefined): string[] {
  return (text ?? "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
}
