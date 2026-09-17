import webpush from "web-push";
import { eq, inArray, sql } from "drizzle-orm";
import { pushAbos } from "@tdd/db";
import { db } from "./db";

/**
 * Web-Push fuer myTafelwerk (062). Schluessel aus der Umgebung (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT). Ohne Schluessel ist Push aus – die App funktioniert dann ohne Benachrichtigungen.
 * Der Inhalt jeder Nachricht ist Ende-zu-Ende verschluesselt (RFC 8291); der Push-Dienst des
 * Browserherstellers (Google/Apple/Mozilla) sieht nur Endpunkt und Zeitpunkt, keinen Text.
 */
export interface PushNachricht { titel: string; text: string; url?: string; tag?: string }

export function pushAktiv(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | null { return process.env.VAPID_PUBLIC_KEY ?? null; }

function konfigurieren(): boolean {
  if (!pushAktiv()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:info@schaer-systems.at", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return true;
}

/** Nachricht an alle Geraete der genannten Personal-Datensaetze (leer = niemand). Fehlerhafte Abos werden nach 5 Fehlern entfernt. */
export async function pushAnPersonal(staffIds: string[], n: PushNachricht): Promise<{ gesendet: number; fehler: number }> {
  if (!konfigurieren() || staffIds.length === 0) return { gesendet: 0, fehler: 0 };
  const abos = await db().select().from(pushAbos).where(inArray(pushAbos.staffId, staffIds));
  let gesendet = 0, fehler = 0;
  for (const a of abos) {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify({ title: n.titel, body: n.text, url: n.url ?? "/my", tag: n.tag }), { TTL: 60 * 60 * 24, urgency: "normal" });
      gesendet++;
      await db().update(pushAbos).set({ zuletztOk: new Date(), fehler: 0 }).where(eq(pushAbos.id, a.id));
    } catch (e) {
      fehler++;
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410 || a.fehler >= 4) await db().delete(pushAbos).where(eq(pushAbos.id, a.id)); // Abo abgelaufen/abbestellt
      else await db().update(pushAbos).set({ fehler: sql`${pushAbos.fehler} + 1` }).where(eq(pushAbos.id, a.id));
    }
  }
  return { gesendet, fehler };
}
