import { z } from "zod";

/*
 * Einheitliche Eingabevalidierung fuer Server Actions.
 * Ersetzt die in mehreren Actions duplizierten s()/n()/i()-Helfer.
 * Die Bausteine bilden deren Verhalten exakt nach, damit sich nichts aendert:
 *   text      – getrimmt, leer -> null
 *   ganzzahl  – Nicht-Ziffern entfernt, parseInt, leer/ungueltig -> null
 *   betrag    – parseFloat mit Komma als Dezimaltrenner, ungueltig -> 0
 */

/** FormData liefert Strings oder Dateien; alles andere als String wird zu null. */
const roh = z.unknown().transform((v) => (typeof v === "string" ? v.trim() : ""));

export const text = roh.transform((v) => (v === "" ? null : v));

export const ganzzahl = roh.transform((v) => {
  if (v === "") return null;
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
});

export const betrag = roh.transform((v) => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
});

/** Wie ganzzahl, aber mit Vorgabe statt null. */
export const ganzzahlMit = (vorgabe: number) => ganzzahl.transform((v) => v ?? vorgabe);

const pflichtText = roh.refine((v) => v !== "", { message: "Pflichtfeld" });

/** Person anlegen / bearbeiten (Backoffice). */
export const personSchema = z.object({
  firstName: pflichtText,
  lastName: pflichtText,
  address: text,
  postalCode: text,
  city: text,
  birthDate: text,
  phone: text,
  email: text,
  note: text,
  adults: ganzzahl,
  childrenCount: ganzzahl,
  languageId: ganzzahl,
  originId: ganzzahl,
  locationId: ganzzahl,
});
export type PersonInput = z.infer<typeof personSchema>;

/** Bearbeiten kennt zusaetzlich Gruppe und Nummer an der Ausgabestelle. */
export const personBearbeitenSchema = personSchema.extend({
  gruppe: ganzzahl,
  nummer: ganzzahl,
});

/** Antrag im Portal (Gemeinde / Institution). */
export const antragSchema = z.object({
  firstName: pflichtText,
  lastName: pflichtText,
  email: text,
  phone: text,
  address: text,
  postalCode: text,
  city: text,
  birthDate: text,
  pets: text,
  targetType: text.transform((v) => (v === "LADEN" ? "LADEN" : "AUSGABESTELLE")),
  intendedLocationId: ganzzahl,
  adults: ganzzahlMit(1),
  childrenU12: ganzzahlMit(0),
  childrenO12: ganzzahlMit(0),
});
export type AntragInput = z.infer<typeof antragSchema>;

/** Einheitliches Ergebnis fuer Server Actions. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** FormData -> Objekt, damit zod es parsen kann. Fehlende Schluessel werden zu "" (wie fd.get). */
export function formObject(fd: FormData, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = fd.get(k);
  return out;
}

export function parseForm<S extends z.ZodObject<z.ZodRawShape>>(schema: S, fd: FormData): ActionResult<z.infer<S>> {
  const res = schema.safeParse(formObject(fd, Object.keys(schema.shape)));
  if (res.success) return { ok: true, data: res.data };
  const first = res.error.issues[0];
  const feld = first?.path[0];
  return { ok: false, error: feld ? `${String(feld)}: ${first.message}` : (first?.message ?? "Eingabe ungültig") };
}
