import { and, eq, lt } from "drizzle-orm";
import { cards, persons } from "@tdd/db";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { requireJobToken } from "@/lib/job-auth";
import { fuerAlleMandanten } from "@/lib/tenant-jobs";
import { mandant } from "@/lib/mandant";

/**
 * Karten-Ablauf-Job: markiert abgelaufene Karten als ABGELAUFEN und benachrichtigt
 * die Klient/innen per E-Mail (mit Hinweis, dass ein neuer Antrag nötig ist).
 * Token-geschützt (JOB_TOKEN) – per täglichem Cron aufrufbar:
 *   curl -H "Authorization: Bearer $JOB_TOKEN" http://127.0.0.1:3080/api/jobs/expiry
 */
export async function GET(req: Request) {
  const denied = requireJobToken(req);
  if (denied) return denied;
  // Je aktivem Mandanten im eigenen Kontext (Pool mit GUC, RLS) – Ergebnisse je Mandant
  const ergebnis = await fuerAlleMandanten(() => lauf());
  return Response.json(ergebnis);
}

async function lauf(): Promise<unknown> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const expired = await db()
    .select({ cardId: cards.id, number: cards.cardNumber, email: persons.email, first: persons.firstName, last: persons.lastName })
    .from(cards).innerJoin(persons, eq(cards.personId, persons.id))
    .where(and(eq(cards.status, "AKTIV"), lt(cards.validTo, todayStr)));

  let mailed = 0;
  const m = await mandant();
  for (const c of expired) {
    await db().update(cards).set({ status: "ABGELAUFEN", updatedAt: new Date() }).where(eq(cards.id, c.cardId));
    if (c.email) {
      const r = await sendMail({
        to: c.email,
        subject: `${m.kurzname} – Ihre Berechtigungskarte ist abgelaufen`,
        text: `Guten Tag ${c.first} ${c.last},\n\nIhre Berechtigungskarte ist abgelaufen. Für eine weitere Nutzung stellen Sie bitte einen neuen Antrag bei Ihrer Gemeinde/Stadt oder der betreuenden Institution.\n\nFreundliche Grüße\nTischlein deck dich`,
      });
      if (r.sent) mailed++;
    }
  }

  await audit({ action: "job.card.expiry", entityType: "job", after: { expired: expired.length, mailed } });
  return { expired: expired.length, mailed };
}
