"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { ziviMeldungen } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";

const ARTEN = ["DIENSTANTRITT", "KRANK", "VERLAENGERUNG", "DIENSTENDE", "SONSTIG"];

/** Meldung an die Zivildienstserviceagentur als erledigt vermerken (oder wieder oeffnen). */
export async function meldungErledigt(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const staffId = String(fd.get("staffId") ?? ""); const art = String(fd.get("art") ?? ""); const bezug = String(fd.get("bezug") ?? "");
  if (!staffId || !ARTEN.includes(art) || !bezug) return;
  if (fd.get("zuruecknehmen") === "1") {
    await db().delete(ziviMeldungen).where(and(eq(ziviMeldungen.staffId, staffId), eq(ziviMeldungen.art, art), eq(ziviMeldungen.bezug, bezug)));
    await audit({ actorUserId: u.id, action: "zivi.meldung.offen", entityType: "staff", entityId: staffId, after: { art, bezug } });
  } else {
    await db().insert(ziviMeldungen).values({ staffId, art, bezug, gemeldetBy: u.id, notiz: String(fd.get("notiz") ?? "").trim() || null }).onConflictDoNothing();
    await audit({ actorUserId: u.id, action: "zivi.meldung.erledigt", entityType: "staff", entityId: staffId, after: { art, bezug } });
  }
  revalidatePath("/personal/zivildienst");
}
