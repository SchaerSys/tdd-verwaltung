import { eq } from "drizzle-orm";
import { staff, touren } from "@tdd/db";
import { db } from "@/lib/db";
import { geraetAusCookie } from "@/lib/geraet";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { positionMelden } from "@/lib/geofence-daten";

import { mitMandant } from "@/lib/tenant-request";

export const dynamic = "force-dynamic";

/**
 * Positionsmeldung des Fahrzeug-Tablets waehrend einer Tour (Geofencing).
 * Berechtigt: das gekoppelte Tablet des Tour-Fahrzeugs oder ein Login mit tour:drive/tour:manage.
 * Gespeichert werden nur Ankunft/Abfahrt-Ereignisse und die letzte Position – kein Verlauf.
 */
export async function POST(req: Request): Promise<Response> {
  return mitMandant(() => post(req));
}

async function post(req: Request): Promise<Response> {
  let body: { tourId?: string; lat?: number; lng?: number; genauigkeitM?: number | null } = {};
  try { body = (await req.json()) as typeof body; } catch { return Response.json({ ortung: false, grund: "Ungültige Anfrage" }, { status: 400 }); }
  const tourId = String(body.tourId ?? "");
  if (!/^[0-9a-f-]{36}$/.test(tourId)) return Response.json({ ortung: false, grund: "Tour fehlt" }, { status: 400 });

  const t = (await db().select({ id: touren.id, fahrzeugId: touren.fahrzeugId, freigegebenAt: touren.freigegebenAt, fahrerId: touren.fahrerId, beifahrerId: touren.beifahrerId }).from(touren).where(eq(touren.id, tourId)).limit(1))[0];
  if (!t) return Response.json({ ortung: false, grund: "Tour nicht gefunden" }, { status: 404 });

  const g = await geraetAusCookie();
  let erlaubt = !!g && g.fahrzeugId === t.fahrzeugId && !!t.freigegebenAt;
  if (!erlaubt) {
    const u = await getCurrentUser();
    if (u && hasPermission(u.role, "tour:manage")) erlaubt = true;
    else if (u && hasPermission(u.role, "tour:drive")) {
      const me = (await db().select({ id: staff.id }).from(staff).where(eq(staff.userId, u.id)).limit(1))[0];
      erlaubt = !!me && (t.fahrerId === me.id || t.beifahrerId === me.id);
    }
  }
  if (!erlaubt) return Response.json({ ortung: false, grund: "Nicht berechtigt" }, { status: 403 });

  const lat = Number(body.lat); const lng = Number(body.lng);
  const acc = body.genauigkeitM == null ? null : Math.round(Number(body.genauigkeitM));
  const r = await positionMelden(tourId, { lat, lng, at: new Date(), genauigkeitM: Number.isFinite(acc) ? acc : null });
  return Response.json(r);
}
