"use server";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { runWithTenant, TENANT_VORARLBERG, istTenantId } from "@tdd/db";
import { db } from "@/lib/db";
import { tokenHash } from "@/lib/einwilligung";
import { audit } from "@/lib/audit";

function rows<T>(res: unknown): T[] { return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[]; }

export async function bestaetigen(fd: FormData): Promise<void> {
  const token = String(fd.get("token") ?? "");
  if (fd.get("gelesen") !== "on" || !token) return;
  const r = rows<{ antrag_id: string; vorname: string; tenant_id: string }>(await runWithTenant(TENANT_VORARLBERG, () => db().execute(sql`SELECT * FROM einwilligung_per_link(${tokenHash(token)})`)))[0];
  if (r && istTenantId(r.tenant_id)) {
    await runWithTenant(r.tenant_id, () => audit({ actorUserId: null, action: "antrag.einwilligung.link", entityType: "antrag", entityId: r.antrag_id }));
  }
  redirect(`/einwilligung/${token}?ok=1`);
}
