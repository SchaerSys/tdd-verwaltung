import { angeboteEingang } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireJobToken } from "@/lib/job-auth";
import { fuerAlleMandanten } from "@/lib/tenant-jobs";

/**
 * Nachtjob: offene Abholangebote von der Homepage holen (Schnittstelle
 * docs/Schnittstelle-Tourenplanung.md im Homepage-Repo). Abholung statt Zuruf –
 * faellt eine Seite aus, geht nichts verloren. Braucht HOMEPAGE_API_URL + UEBERGABE_TOKEN.
 *   curl -H "Authorization: Bearer $JOB_TOKEN" http://127.0.0.1:3080/api/jobs/angebote
 */
export async function GET(req: Request) {
  const denied = requireJobToken(req);
  if (denied) return denied;
  // Je aktivem Mandanten im eigenen Kontext (Pool mit GUC, RLS) – Ergebnisse je Mandant
  const ergebnis = await fuerAlleMandanten(() => lauf());
  return Response.json(ergebnis);
}

async function lauf(): Promise<unknown> {
  const url = process.env.HOMEPAGE_API_URL; const token = process.env.UEBERGABE_TOKEN;
  if (!url || !token) return { ok: false, error: "HOMEPAGE_API_URL / UEBERGABE_TOKEN fehlen" };
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/api/uebergabe/lebensmittel?limit=200`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return { ok: false, error: `Homepage ${r.status}` };
    const j = (await r.json()) as { angebote?: { id: number; betrieb: string; eingegangen: string }[] };
    let neu = 0;
    for (const a of j.angebote ?? []) {
      const ins = await db().insert(angeboteEingang).values({ homepageId: a.id, betrieb: a.betrieb, daten: a, eingegangen: new Date(a.eingegangen) }).onConflictDoNothing().returning({ id: angeboteEingang.id });
      if (ins[0]) neu += 1;
    }
    await audit({ action: "job.angebote", entityType: "job", after: { neu, offen: j.angebote?.length ?? 0 } });
    return { ok: true, neu, offen: j.angebote?.length ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
