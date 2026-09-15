import { appEvents } from "@tdd/db";
import { db } from "./db";

/**
 * Meldungen an die Wartung (Support-Sicht, Migration 033): Fehler und Lebenszeichen.
 * Bewusst ohne Personenbezug – die Tabelle liest die Wartungsrolle.
 */
export type EreignisArt = "FEHLER" | "LEBENSZEICHEN";

export interface Ereignis {
  kind: EreignisArt;
  userId?: string | null; role?: string | null; locationId?: number | null; organizationId?: number | null;
  route?: string | null; message?: string | null; digest?: string | null;
  detail?: Record<string, unknown>;
}

/** Text ohne E-Mail-Adressen und lange Zahlenfolgen (Telefon, Kartennummern), gekuerzt. */
export function saeubern(text: string | null | undefined, max = 300): string | null {
  if (!text) return null;
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[mail]")
    .replace(/\d{5,}/g, "[zahl]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || null;
}

const ERLAUBTE_DETAILS = ["version", "online", "queue", "ua", "screen", "nfc", "stack"] as const;

/** Nur bekannte Schluessel, jeder Wert gekuerzt – der Client kann sonst beliebiges anliefern. */
export function detailFiltern(detail: unknown): Record<string, unknown> {
  if (!detail || typeof detail !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const k of ERLAUBTE_DETAILS) {
    const v = (detail as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "boolean" || typeof v === "number") out[k] = v;
    else if (typeof v === "string") out[k] = saeubern(v, k === "stack" ? 1500 : 200);
  }
  return out;
}

export async function meldeEreignis(e: Ereignis): Promise<void> {
  try {
    await db().insert(appEvents).values({
      kind: e.kind, userId: e.userId ?? null, role: e.role ?? null, locationId: e.locationId ?? null, organizationId: e.organizationId ?? null,
      route: saeubern(e.route, 200), message: saeubern(e.message), digest: e.digest ? e.digest.slice(0, 64) : null,
      detail: detailFiltern(e.detail),
    });
  } catch {
    // Die Meldung darf nie selbst zum Fehler werden.
  }
}
